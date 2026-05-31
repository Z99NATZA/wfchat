use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use sqlx::{PgPool, Row};
use uuid::Uuid;

use crate::ai::{AiMessage, AiRole};

#[derive(Clone)]
pub struct ChatStore {
    db: Arc<PgPool>,
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
    pub async fn connect(database_url: &str) -> Result<Self, sqlx::Error> {
        let db = PgPool::connect(database_url).await?;
        let store = Self { db: Arc::new(db) };
        store.migrate().await?;
        Ok(store)
    }

    pub async fn create_guest_session(&self) -> SessionRecord {
        let session = SessionRecord {
            id: Uuid::new_v4(),
            user_id: Uuid::new_v4(),
            kind: UserKind::Guest,
            created_at: now_unix_seconds(),
        };

        let _ = sqlx::query(
            "insert into auth_sessions (id, user_id, kind, created_at) values ($1, $2, $3, to_timestamp($4))",
        )
        .bind(session.id)
        .bind(session.user_id)
        .bind("guest")
        .bind(session.created_at as i64)
        .execute(self.db.as_ref())
        .await;

        session
    }

    pub async fn ensure_session(&self, session_id: Option<Uuid>) -> SessionRecord {
        if let Some(id) = session_id {
            if let Some(session) = self.get_session(id).await {
                return session;
            }

            let session = SessionRecord {
                id,
                user_id: Uuid::new_v4(),
                kind: UserKind::Guest,
                created_at: now_unix_seconds(),
            };

            let _ = sqlx::query(
                "insert into auth_sessions (id, user_id, kind, created_at) values ($1, $2, $3, to_timestamp($4))",
            )
            .bind(session.id)
            .bind(session.user_id)
            .bind("guest")
            .bind(session.created_at as i64)
            .execute(self.db.as_ref())
            .await;
            return session;
        }

        self.create_guest_session().await
    }

    pub async fn get_session(&self, session_id: Uuid) -> Option<SessionRecord> {
        let row = sqlx::query(
            "select id, user_id, kind, extract(epoch from created_at)::bigint as created_at from auth_sessions where id = $1",
        )
        .bind(session_id)
        .fetch_optional(self.db.as_ref())
        .await
        .ok()??;

        Some(SessionRecord {
            id: row.get("id"),
            user_id: row.get("user_id"),
            kind: UserKind::Guest,
            created_at: row.get::<i64, _>("created_at") as u64,
        })
    }

    pub async fn list_chats(&self, session_id: Uuid) -> Vec<ChatRecord> {
        let rows = sqlx::query(
            "select id, owner_session_id, character_id, ai_profile_id, extract(epoch from created_at)::bigint as created_at, extract(epoch from updated_at)::bigint as updated_at from chats where owner_session_id = $1 order by updated_at desc",
        )
        .bind(session_id)
        .fetch_all(self.db.as_ref())
        .await
        .unwrap_or_default();

        let mut chats = Vec::with_capacity(rows.len());
        for row in rows {
            let chat_id: Uuid = row.get("id");
            chats.push(ChatRecord {
                id: chat_id,
                owner_session_id: row.get("owner_session_id"),
                character_id: row.get("character_id"),
                ai_profile_id: row.get("ai_profile_id"),
                messages: self.messages_for_chat(chat_id).await,
                created_at: row.get::<i64, _>("created_at") as u64,
                updated_at: row.get::<i64, _>("updated_at") as u64,
            });
        }
        chats
    }

    pub async fn create_chat(
        &self,
        session_id: Uuid,
        character_id: String,
        ai_profile_id: String,
    ) -> ChatRecord {
        let id = Uuid::new_v4();
        let now = now_unix_seconds() as i64;
        let _ = sqlx::query(
            "insert into chats (id, owner_session_id, character_id, ai_profile_id, created_at, updated_at) values ($1, $2, $3, $4, to_timestamp($5), to_timestamp($5))",
        )
        .bind(id)
        .bind(session_id)
        .bind(&character_id)
        .bind(&ai_profile_id)
        .bind(now)
        .execute(self.db.as_ref())
        .await;

        ChatRecord {
            id,
            owner_session_id: session_id,
            character_id,
            ai_profile_id,
            messages: Vec::new(),
            created_at: now as u64,
            updated_at: now as u64,
        }
    }

    pub async fn get_chat(&self, session_id: Uuid, chat_id: Uuid) -> Option<ChatRecord> {
        let row = sqlx::query(
            "select id, owner_session_id, character_id, ai_profile_id, extract(epoch from created_at)::bigint as created_at, extract(epoch from updated_at)::bigint as updated_at from chats where id = $1 and owner_session_id = $2",
        )
        .bind(chat_id)
        .bind(session_id)
        .fetch_optional(self.db.as_ref())
        .await
        .ok()??;

        Some(ChatRecord {
            id: row.get("id"),
            owner_session_id: row.get("owner_session_id"),
            character_id: row.get("character_id"),
            ai_profile_id: row.get("ai_profile_id"),
            messages: self.messages_for_chat(chat_id).await,
            created_at: row.get::<i64, _>("created_at") as u64,
            updated_at: row.get::<i64, _>("updated_at") as u64,
        })
    }

    pub async fn append_chat_messages(
        &self,
        session_id: Uuid,
        chat_id: Uuid,
        user_message: StoredMessage,
        assistant_message: StoredMessage,
    ) -> Option<ChatRecord> {
        let owner_exists = sqlx::query("select id from chats where id = $1 and owner_session_id = $2")
            .bind(chat_id)
            .bind(session_id)
            .fetch_optional(self.db.as_ref())
            .await
            .ok()?
            .is_some();
        if !owner_exists {
            return None;
        }

        let _ = sqlx::query(
            "insert into chat_messages (id, chat_id, role, content, created_at) values ($1, $2, $3, $4, to_timestamp($5)), ($6, $2, $7, $8, to_timestamp($9))",
        )
        .bind(user_message.id)
        .bind(chat_id)
        .bind(role_to_db(&user_message.role))
        .bind(&user_message.content)
        .bind(user_message.created_at as i64)
        .bind(assistant_message.id)
        .bind(role_to_db(&assistant_message.role))
        .bind(&assistant_message.content)
        .bind(assistant_message.created_at as i64)
        .execute(self.db.as_ref())
        .await;

        let _ = sqlx::query("update chats set updated_at = now() where id = $1")
            .bind(chat_id)
            .execute(self.db.as_ref())
            .await;

        self.get_chat(session_id, chat_id).await
    }

    pub async fn clear_chat_messages(&self, session_id: Uuid, chat_id: Uuid) -> Option<ChatRecord> {
        let owner_exists = sqlx::query("select id from chats where id = $1 and owner_session_id = $2")
            .bind(chat_id)
            .bind(session_id)
            .fetch_optional(self.db.as_ref())
            .await
            .ok()?
            .is_some();
        if !owner_exists {
            return None;
        }

        let _ = sqlx::query("delete from chat_messages where chat_id = $1")
            .bind(chat_id)
            .execute(self.db.as_ref())
            .await;
        let _ = sqlx::query("update chats set updated_at = now() where id = $1")
            .bind(chat_id)
            .execute(self.db.as_ref())
            .await;

        self.get_chat(session_id, chat_id).await
    }

    async fn messages_for_chat(&self, chat_id: Uuid) -> Vec<StoredMessage> {
        let rows = sqlx::query(
            "select id, role, content, extract(epoch from created_at)::bigint as created_at from chat_messages where chat_id = $1 order by created_at asc, id asc",
        )
        .bind(chat_id)
        .fetch_all(self.db.as_ref())
        .await
        .unwrap_or_default();

        rows.into_iter()
            .filter_map(|row| {
                let role_value: String = row.get("role");
                let role = role_from_db(&role_value)?;
                Some(StoredMessage {
                    id: row.get("id"),
                    role,
                    content: row.get("content"),
                    created_at: row.get::<i64, _>("created_at") as u64,
                })
            })
            .collect()
    }

    async fn migrate(&self) -> Result<(), sqlx::Error> {
        sqlx::query(
            "create table if not exists auth_sessions (
                id uuid primary key,
                user_id uuid not null,
                kind text not null,
                created_at timestamptz not null default now()
            )",
        )
        .execute(self.db.as_ref())
        .await?;

        sqlx::query(
            "create table if not exists chats (
                id uuid primary key,
                owner_session_id uuid not null references auth_sessions(id) on delete cascade,
                character_id text not null,
                ai_profile_id text not null,
                created_at timestamptz not null default now(),
                updated_at timestamptz not null default now()
            )",
        )
        .execute(self.db.as_ref())
        .await?;

        sqlx::query(
            "create table if not exists chat_messages (
                id uuid primary key,
                chat_id uuid not null references chats(id) on delete cascade,
                role text not null,
                content text not null,
                created_at timestamptz not null default now()
            )",
        )
        .execute(self.db.as_ref())
        .await?;

        sqlx::query("create index if not exists idx_chats_owner_updated on chats(owner_session_id, updated_at desc)")
            .execute(self.db.as_ref())
            .await?;
        sqlx::query("create index if not exists idx_chats_owner_character_updated on chats(owner_session_id, character_id, updated_at desc)")
            .execute(self.db.as_ref())
            .await?;
        sqlx::query("create index if not exists idx_messages_chat_created on chat_messages(chat_id, created_at asc)")
            .execute(self.db.as_ref())
            .await?;
        Ok(())
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

fn role_to_db(role: &AiRole) -> &'static str {
    match role {
        AiRole::System => "system",
        AiRole::User => "user",
        AiRole::Assistant => "assistant",
    }
}

fn role_from_db(value: &str) -> Option<AiRole> {
    match value {
        "system" => Some(AiRole::System),
        "user" => Some(AiRole::User),
        "assistant" => Some(AiRole::Assistant),
        _ => None,
    }
}
