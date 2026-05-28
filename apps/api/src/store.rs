use std::{
    collections::HashMap,
    path::PathBuf,
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;
use uuid::Uuid;

use crate::{
    ai::{AiMessage, AiRole},
    characters,
};

#[derive(Clone)]
pub struct ChatStore {
    path: PathBuf,
    inner: Arc<RwLock<StoreData>>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
struct StoreData {
    sessions: HashMap<Uuid, SessionRecord>,
    chats: HashMap<Uuid, ChatRecord>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct SessionRecord {
    pub id: Uuid,
    pub user_id: Uuid,
    pub kind: UserKind,
    pub created_at: u64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum UserKind {
    Guest,
    Registered,
    Admin,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct ChatRecord {
    pub id: Uuid,
    pub owner_session_id: Uuid,
    pub character_id: String,
    pub ai_profile_id: String,
    pub messages: Vec<StoredMessage>,
    pub created_at: u64,
    pub updated_at: u64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct StoredMessage {
    pub id: Uuid,
    pub role: AiRole,
    pub content: String,
    pub created_at: u64,
}

impl ChatStore {
    pub async fn load(path: impl Into<PathBuf>) -> Self {
        let path = path.into();
        let mut data = match tokio::fs::read_to_string(&path).await {
            Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
            Err(_) => StoreData::default(),
        };
        migrate_store_data(&mut data);

        Self {
            path,
            inner: Arc::new(RwLock::new(data)),
        }
    }

    pub async fn create_guest_session(&self) -> SessionRecord {
        let session = SessionRecord {
            id: Uuid::new_v4(),
            user_id: Uuid::new_v4(),
            kind: UserKind::Guest,
            created_at: now_unix_seconds(),
        };

        {
            let mut data = self.inner.write().await;
            data.sessions.insert(session.id, session.clone());
        }

        self.save().await;
        session
    }

    pub async fn ensure_session(&self, session_id: Option<Uuid>) -> SessionRecord {
        if let Some(session_id) = session_id {
            if let Some(session) = self.get_session(session_id).await {
                return session;
            }
        }

        self.create_guest_session().await
    }

    pub async fn get_session(&self, session_id: Uuid) -> Option<SessionRecord> {
        let data = self.inner.read().await;
        data.sessions.get(&session_id).cloned()
    }

    pub async fn list_chats(&self, session_id: Uuid) -> Vec<ChatRecord> {
        let data = self.inner.read().await;
        let mut chats = data
            .chats
            .values()
            .filter(|chat| chat.owner_session_id == session_id)
            .cloned()
            .collect::<Vec<_>>();

        chats.sort_by_key(|chat| chat.updated_at);
        chats.reverse();
        chats
    }

    pub async fn create_chat(
        &self,
        session_id: Uuid,
        character_id: String,
        ai_profile_id: String,
    ) -> ChatRecord {
        let now = now_unix_seconds();
        let chat = ChatRecord {
            id: Uuid::new_v4(),
            owner_session_id: session_id,
            character_id,
            ai_profile_id,
            messages: Vec::new(),
            created_at: now,
            updated_at: now,
        };

        {
            let mut data = self.inner.write().await;
            data.chats.insert(chat.id, chat.clone());
        }

        self.save().await;
        chat
    }

    pub async fn get_chat(&self, session_id: Uuid, chat_id: Uuid) -> Option<ChatRecord> {
        let data = self.inner.read().await;
        data.chats
            .get(&chat_id)
            .filter(|chat| chat.owner_session_id == session_id)
            .cloned()
    }

    pub async fn append_chat_messages(
        &self,
        session_id: Uuid,
        chat_id: Uuid,
        user_message: StoredMessage,
        assistant_message: StoredMessage,
    ) -> Option<ChatRecord> {
        let updated_chat = {
            let mut data = self.inner.write().await;
            let chat = data
                .chats
                .get_mut(&chat_id)
                .filter(|chat| chat.owner_session_id == session_id)?;

            chat.messages.push(user_message);
            chat.messages.push(assistant_message);
            chat.updated_at = now_unix_seconds();
            chat.clone()
        };

        self.save().await;
        Some(updated_chat)
    }

    pub async fn clear_chat_messages(&self, session_id: Uuid, chat_id: Uuid) -> Option<ChatRecord> {
        let updated_chat = {
            let mut data = self.inner.write().await;
            let chat = data
                .chats
                .get_mut(&chat_id)
                .filter(|chat| chat.owner_session_id == session_id)?;

            chat.messages.clear();
            chat.updated_at = now_unix_seconds();
            chat.clone()
        };

        self.save().await;
        Some(updated_chat)
    }

    async fn save(&self) {
        let snapshot = {
            let data = self.inner.read().await;
            data.clone()
        };

        if let Some(parent) = self.path.parent() {
            let _ = tokio::fs::create_dir_all(parent).await;
        }

        if let Ok(content) = serde_json::to_string_pretty(&snapshot) {
            let _ = tokio::fs::write(&self.path, content).await;
        }
    }
}

impl StoredMessage {
    pub fn from_ai_message(message: AiMessage) -> Self {
        Self {
            id: Uuid::new_v4(),
            role: message.role,
            content: message.content,
            created_at: now_unix_seconds(),
        }
    }

    pub fn to_ai_message(&self) -> AiMessage {
        AiMessage {
            role: self.role.clone(),
            content: self.content.clone(),
        }
    }
}

fn now_unix_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default()
}

fn migrate_store_data(data: &mut StoreData) {
    for chat in data.chats.values_mut() {
        if chat.character_id == "aiko" && !characters::is_aiko_profile(&chat.ai_profile_id) {
            chat.ai_profile_id = characters::default_character().ai_profile_id.to_owned();
        }

        if chat.character_id == "aiko" && chat.ai_profile_id == "default_waifu" {
            chat.ai_profile_id = characters::default_character().ai_profile_id.to_owned();
        }
    }
}
