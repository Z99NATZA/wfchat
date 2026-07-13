use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{PgPool, Postgres, Row, Transaction};
use uuid::Uuid;

use crate::ai::{AiMessage, AiRole};

mod attachments;
mod auth;
mod chat;
mod memory;
mod sync;

use memory::{cleanup_memory_after_source_removal, recalculate_memory_evidence};
pub type StoreResult<T> = Result<T, sqlx::Error>;

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

#[derive(Clone, Copy, Debug)]
pub struct OwnerScope {
    pub session_id: Uuid,
    pub user_id: Option<Uuid>,
}

impl OwnerScope {
    pub fn from_session(session: &SessionRecord) -> Self {
        Self {
            session_id: session.id,
            user_id: match &session.kind {
                UserKind::Guest => None,
                UserKind::Registered | UserKind::Admin => Some(session.user_id),
            },
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum UserKind {
    Guest,
    Registered,
    Admin,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct AuthIdentityRecord {
    pub user_id: Uuid,
    pub provider: String,
    pub provider_subject: String,
    pub email: Option<String>,
    pub provider_name: Option<String>,
    pub provider_avatar_url: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct UserProfileRecord {
    pub user_id: Uuid,
    pub display_name: String,
    pub avatar_url: Option<String>,
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
    pub attachments: Vec<ChatAttachmentRecord>,
    pub created_at: u64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct ChatAttachmentRecord {
    pub id: Uuid,
    pub owner_session_id: Uuid,
    pub owner_user_id: Option<Uuid>,
    pub chat_id: Option<Uuid>,
    pub message_id: Option<Uuid>,
    pub kind: String,
    pub mime_type: String,
    pub byte_size: i64,
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub sha256: String,
    pub storage_key: String,
    pub created_at: u64,
    pub deleted_at: Option<u64>,
}

#[derive(Clone, Debug)]
pub struct NewChatAttachmentRecord {
    pub id: Uuid,
    pub kind: String,
    pub mime_type: String,
    pub byte_size: i64,
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub sha256: String,
    pub storage_key: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct MemoryItemRecord {
    pub id: Uuid,
    pub owner_session_id: Uuid,
    pub owner_user_id: Option<Uuid>,
    pub character_id: String,
    pub memory_key: String,
    pub kind: String,
    pub content: String,
    pub tags: Vec<String>,
    pub confidence: f32,
    pub importance: f32,
    pub last_reinforced_at: u64,
    pub expires_at: Option<u64>,
    pub created_at: u64,
    pub updated_at: u64,
}

#[derive(Clone, Debug)]
pub struct NewMemoryItemRecord {
    pub character_id: String,
    pub memory_key: String,
    pub kind: String,
    pub content: String,
    pub tags: Vec<String>,
    pub confidence: f32,
    pub importance: f32,
    pub last_reinforced_at: u64,
    pub expires_at: Option<u64>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct MemorySourceRecord {
    pub id: Uuid,
    pub memory_id: Uuid,
    pub chat_id: Uuid,
    pub message_id: Option<Uuid>,
    pub evidence_strength: f32,
    pub created_at: u64,
}

#[derive(Clone, Debug)]
pub struct MemoryRetrievalRecord {
    pub id: Uuid,
    pub memory_key: String,
    pub kind: String,
    pub content: String,
    pub tags: Vec<String>,
    pub confidence: f32,
    pub importance: f32,
    pub last_reinforced_at: u64,
    pub expires_at: Option<u64>,
    pub updated_at: u64,
    pub source_count: u32,
}

#[derive(Clone, Debug)]
pub struct MemoryExtractionJobRecord {
    pub id: Uuid,
    pub chat_id: Uuid,
    pub user_message_id: Uuid,
    pub assistant_message_id: Uuid,
    pub owner_session_id: Uuid,
    pub owner_user_id: Option<Uuid>,
    pub character_id: String,
    pub status: String,
    pub attempts: i32,
    pub max_attempts: i32,
    pub user_content: String,
}

#[derive(Clone, Debug)]
pub struct CapturedMemoryRecord {
    pub memory_key: String,
    pub kind: String,
    pub content: String,
    pub tags: Vec<String>,
    pub importance: f32,
    pub evidence_strength: f32,
    pub replaces_existing: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct SyncCommitRecord {
    pub operation_id: String,
    pub session_id: Uuid,
    pub user_id: Uuid,
    pub merged_count: u32,
    pub conflict_count: u32,
    pub committed_at: u64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct SyncEntityRecord {
    pub session_id: Uuid,
    pub owner_user_id: Option<Uuid>,
    pub item_id: String,
    pub item_type: String,
    pub updated_at: u64,
    pub deleted_at: Option<u64>,
    pub payload: Value,
}

impl StoredMessage {
    pub fn from_ai_message(message: AiMessage) -> Self {
        let content = message.text_content();
        Self {
            id: Uuid::new_v4(),
            role: message.role,
            content,
            attachments: Vec::new(),
            created_at: now_unix_seconds(),
        }
    }

    pub fn to_ai_message(&self) -> AiMessage {
        AiMessage::text(self.role.clone(), self.content.clone())
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

fn parse_user_kind(value: &str) -> UserKind {
    match value {
        "registered" => UserKind::Registered,
        "admin" => UserKind::Admin,
        _ => UserKind::Guest,
    }
}

fn non_empty_string(value: Option<String>) -> Option<String> {
    value
        .map(|item| item.trim().to_owned())
        .filter(|item| !item.is_empty())
}

#[cfg(test)]
mod integration_tests {
    use super::*;
    use serde_json::json;

    async fn test_store() -> Option<ChatStore> {
        let database_url = std::env::var("WFCHAT_TEST_DATABASE_URL").ok()?;
        ChatStore::connect(&database_url).await.ok()
    }

    async fn create_test_session(store: &ChatStore) -> SessionRecord {
        store
            .create_guest_session()
            .await
            .expect("guest session should create")
    }

    async fn create_test_chat(store: &ChatStore, owner: OwnerScope) -> ChatRecord {
        store
            .create_chat(owner, "aiko".to_owned(), "aiko_default".to_owned())
            .await
            .expect("chat should create")
    }

    async fn append_test_turn(
        store: &ChatStore,
        owner: OwnerScope,
        chat_id: Uuid,
        content: &str,
    ) -> (StoredMessage, StoredMessage) {
        let user = StoredMessage {
            id: Uuid::new_v4(),
            role: AiRole::User,
            content: content.to_owned(),
            attachments: Vec::new(),
            created_at: now_unix_seconds(),
        };
        let assistant = StoredMessage {
            id: Uuid::new_v4(),
            role: AiRole::Assistant,
            content: "Thanks for telling me".to_owned(),
            attachments: Vec::new(),
            created_at: now_unix_seconds(),
        };
        store
            .append_chat_messages(owner, chat_id, user.clone(), assistant.clone())
            .await
            .expect("turn append should query")
            .expect("chat should exist");
        (user, assistant)
    }

    fn captured_memory(content: &str, replaces_existing: bool) -> CapturedMemoryRecord {
        CapturedMemoryRecord {
            memory_key: "food.spice.preference".to_owned(),
            kind: "preference".to_owned(),
            content: content.to_owned(),
            tags: vec!["food".to_owned(), "spicy".to_owned()],
            importance: 0.8,
            evidence_strength: 0.8,
            replaces_existing,
        }
    }

    fn test_memory(
        character_id: &str,
        memory_key: &str,
        content: &str,
        confidence: f32,
    ) -> NewMemoryItemRecord {
        NewMemoryItemRecord {
            character_id: character_id.to_owned(),
            memory_key: memory_key.to_owned(),
            kind: "preference".to_owned(),
            content: content.to_owned(),
            tags: vec!["travel".to_owned(), "food".to_owned()],
            confidence,
            importance: 0.7,
            last_reinforced_at: now_unix_seconds(),
            expires_at: None,
        }
    }

    async fn promote_test_session(
        store: &ChatStore,
        session_id: Uuid,
        user_id: Uuid,
        label: &'static str,
    ) -> SessionRecord {
        store
            .promote_session_to_registered(session_id, user_id)
            .await
            .expect("session promotion should query")
            .unwrap_or_else(|| panic!("{label} should promote"))
    }

    async fn cleanup_sessions(store: &ChatStore, session_ids: &[Uuid]) {
        for session_id in session_ids {
            let _ = sqlx::query("delete from auth_sessions where id = $1")
                .bind(session_id)
                .execute(store.db.as_ref())
                .await;
        }
    }

    async fn cleanup_users(store: &ChatStore, user_ids: &[Uuid]) {
        for user_id in user_ids {
            let _ = sqlx::query("delete from user_profiles where user_id = $1")
                .bind(user_id)
                .execute(store.db.as_ref())
                .await;
            let _ = sqlx::query("delete from auth_identities where user_id = $1")
                .bind(user_id)
                .execute(store.db.as_ref())
                .await;
        }
    }

    #[tokio::test]
    async fn append_chat_messages_rolls_back_when_attachment_linking_is_incomplete() {
        let Some(store) = test_store().await else {
            return;
        };
        let session = create_test_session(&store).await;
        let owner = OwnerScope::from_session(&session);
        let chat = create_test_chat(&store, owner).await;
        let attachment_id = Uuid::new_v4();
        store
            .create_chat_attachment(
                owner,
                NewChatAttachmentRecord {
                    id: attachment_id,
                    kind: "image".to_owned(),
                    mime_type: "image/png".to_owned(),
                    byte_size: 8,
                    width: Some(1),
                    height: Some(1),
                    sha256: "test-sha256".to_owned(),
                    storage_key: format!("chat-images/{attachment_id}.png"),
                },
            )
            .await
            .expect("attachment should be created");
        let user_message = StoredMessage {
            id: Uuid::new_v4(),
            role: AiRole::User,
            content: "look".to_owned(),
            attachments: Vec::new(),
            created_at: now_unix_seconds(),
        };
        let assistant_message = StoredMessage {
            id: Uuid::new_v4(),
            role: AiRole::Assistant,
            content: "I see it".to_owned(),
            attachments: Vec::new(),
            created_at: now_unix_seconds(),
        };

        let appended = store
            .append_chat_messages_with_attachments(
                owner,
                chat.id,
                user_message,
                assistant_message,
                &[attachment_id, Uuid::new_v4()],
            )
            .await
            .expect("append should query");

        assert!(
            appended.is_none(),
            "append should fail when any requested attachment cannot be linked"
        );
        let persisted = store
            .get_chat(owner, chat.id)
            .await
            .expect("chat lookup should query")
            .expect("chat should remain");
        assert!(
            persisted.messages.is_empty(),
            "message inserts should roll back when attachment linking fails"
        );
        let attachment = store
            .get_chat_attachment(owner, attachment_id)
            .await
            .expect("attachment lookup should query")
            .expect("valid attachment should remain visible");
        assert_eq!(attachment.chat_id, None);
        assert_eq!(attachment.message_id, None);

        cleanup_sessions(&store, &[session.id]).await;
    }

    #[tokio::test]
    async fn registered_owner_reads_chats_across_sessions() {
        let Some(store) = test_store().await else {
            return;
        };
        let user_id = Uuid::new_v4();
        let first_session = create_test_session(&store).await;
        let first_session =
            promote_test_session(&store, first_session.id, user_id, "first session").await;
        store
            .migrate_session_data_to_user(first_session.id, first_session.user_id)
            .await
            .expect("session data should migrate");
        let first_owner = OwnerScope::from_session(&first_session);
        let chat = create_test_chat(&store, first_owner).await;

        let second_session = create_test_session(&store).await;
        let second_session =
            promote_test_session(&store, second_session.id, user_id, "second session").await;
        let second_owner = OwnerScope::from_session(&second_session);

        let chats = store
            .list_chats(second_owner)
            .await
            .expect("registered owner chats should list");
        assert!(chats.iter().any(|item| item.id == chat.id));

        cleanup_sessions(&store, &[first_session.id, second_session.id]).await;
    }

    #[tokio::test]
    async fn registered_owner_sync_entities_across_sessions() {
        let Some(store) = test_store().await else {
            return;
        };
        let user_id = Uuid::new_v4();
        let first_session = create_test_session(&store).await;
        let first_session =
            promote_test_session(&store, first_session.id, user_id, "first session").await;
        let first_owner = OwnerScope::from_session(&first_session);

        let second_session = create_test_session(&store).await;
        let second_session =
            promote_test_session(&store, second_session.id, user_id, "second session").await;
        let second_owner = OwnerScope::from_session(&second_session);

        let saved = store
            .upsert_sync_entity(&SyncEntityRecord {
                session_id: first_session.id,
                owner_user_id: first_owner.user_id,
                item_id: "settings.theme".to_owned(),
                item_type: "setting".to_owned(),
                updated_at: 10,
                deleted_at: None,
                payload: json!({ "key": "theme", "value": "dark" }),
            })
            .await
            .expect("sync entity should save");
        assert!(saved);

        let pulled = store
            .list_sync_entities_since(second_owner, 0, 100)
            .await
            .expect("second owner sync entities should list");
        assert_eq!(pulled.len(), 1);
        assert_eq!(pulled[0].item_id, "settings.theme");
        assert_eq!(pulled[0].payload["value"], "dark");

        let updated = store
            .upsert_sync_entity(&SyncEntityRecord {
                session_id: second_session.id,
                owner_user_id: second_owner.user_id,
                item_id: "settings.theme".to_owned(),
                item_type: "setting".to_owned(),
                updated_at: 12,
                deleted_at: None,
                payload: json!({ "key": "theme", "value": "light" }),
            })
            .await
            .expect("sync entity should update");
        assert!(updated);

        let pulled = store
            .list_sync_entities_since(first_owner, 0, 100)
            .await
            .expect("first owner sync entities should list");
        assert_eq!(pulled.len(), 1);
        assert_eq!(pulled[0].updated_at, 12);
        assert_eq!(pulled[0].payload["value"], "light");

        cleanup_sessions(&store, &[first_session.id, second_session.id]).await;
    }

    #[tokio::test]
    async fn guest_memory_is_owner_scoped() {
        let Some(store) = test_store().await else {
            return;
        };
        let first_session = create_test_session(&store).await;
        let second_session = create_test_session(&store).await;
        let first_owner = OwnerScope::from_session(&first_session);
        let second_owner = OwnerScope::from_session(&second_session);
        let second_chat = create_test_chat(&store, second_owner).await;

        let memory = store
            .upsert_memory_item(
                first_owner,
                test_memory(
                    "aiko",
                    "travel.food.preference",
                    "Likes spicy ramen while travelling",
                    0.8,
                ),
            )
            .await
            .expect("first guest memory should save");

        let second_items = store
            .list_memory_items(second_owner, "aiko")
            .await
            .expect("second guest memory should list");
        assert!(second_items.is_empty());
        let cross_owner_source = store
            .add_memory_source(second_owner, memory.id, second_chat.id, None, 0.9)
            .await
            .expect("cross-owner source validation should query");
        assert!(cross_owner_source.is_none());

        cleanup_sessions(&store, &[first_session.id, second_session.id]).await;
    }

    #[tokio::test]
    async fn retrieval_candidates_enforce_owner_character_and_expiration() {
        let Some(store) = test_store().await else {
            return;
        };
        let first_session = create_test_session(&store).await;
        let second_session = create_test_session(&store).await;
        let first_owner = OwnerScope::from_session(&first_session);
        let second_owner = OwnerScope::from_session(&second_session);

        store
            .upsert_memory_item(
                first_owner,
                test_memory(
                    "aiko",
                    "travel.food.preference",
                    "Likes spicy ramen while travelling",
                    0.9,
                ),
            )
            .await
            .expect("first owner memory should save");
        store
            .upsert_memory_item(
                second_owner,
                test_memory(
                    "aiko",
                    "travel.food.preference",
                    "Likes sushi while travelling",
                    0.9,
                ),
            )
            .await
            .expect("second owner memory should save");
        store
            .upsert_memory_item(
                first_owner,
                test_memory(
                    "other",
                    "travel.food.preference",
                    "Likes curry while travelling",
                    0.9,
                ),
            )
            .await
            .expect("other character memory should save");
        let mut expired = test_memory(
            "aiko",
            "travel.activity.expired",
            "Likes expired travel tours",
            0.9,
        );
        expired.expires_at = Some(now_unix_seconds().saturating_sub(1));
        store
            .upsert_memory_item(first_owner, expired)
            .await
            .expect("expired memory should save");

        let signals = vec!["travel".to_owned(), "food".to_owned()];
        let first = store
            .find_memory_retrieval_candidates(first_owner, "aiko", &signals, 50)
            .await
            .expect("first candidates should query");
        assert_eq!(first.len(), 1);
        assert_eq!(first[0].content, "Likes spicy ramen while travelling");
        let second = store
            .find_memory_retrieval_candidates(second_owner, "aiko", &signals, 50)
            .await
            .expect("second candidates should query");
        assert_eq!(second.len(), 1);
        assert_eq!(second[0].content, "Likes sushi while travelling");
        let other = store
            .find_memory_retrieval_candidates(first_owner, "other", &signals, 50)
            .await
            .expect("other character candidates should query");
        assert_eq!(other.len(), 1);
        assert_eq!(other[0].content, "Likes curry while travelling");

        cleanup_sessions(&store, &[first_session.id, second_session.id]).await;
    }

    #[tokio::test]
    async fn account_promotion_merges_duplicate_memory_and_sources() {
        let Some(store) = test_store().await else {
            return;
        };
        let user_id = Uuid::new_v4();
        let first_session = create_test_session(&store).await;
        let first_session =
            promote_test_session(&store, first_session.id, user_id, "first session").await;
        store
            .migrate_session_data_to_user(first_session.id, user_id)
            .await
            .expect("first session data should migrate");
        let first_owner = OwnerScope::from_session(&first_session);
        let first_chat = create_test_chat(&store, first_owner).await;
        let account_memory = store
            .upsert_memory_item(
                first_owner,
                test_memory(
                    "aiko",
                    "travel.food.preference",
                    "Likes ramen while travelling",
                    0.7,
                ),
            )
            .await
            .expect("account memory should save");
        store
            .add_memory_source(first_owner, account_memory.id, first_chat.id, None, 0.7)
            .await
            .expect("account source should save")
            .expect("account source should be valid");

        let second_session = create_test_session(&store).await;
        let second_guest_owner = OwnerScope::from_session(&second_session);
        let second_chat = create_test_chat(&store, second_guest_owner).await;
        let guest_memory = store
            .upsert_memory_item(
                second_guest_owner,
                test_memory(
                    "aiko",
                    "travel.food.preference",
                    "Likes spicy ramen while travelling",
                    0.9,
                ),
            )
            .await
            .expect("guest memory should save");
        store
            .add_memory_source(
                second_guest_owner,
                guest_memory.id,
                second_chat.id,
                None,
                0.9,
            )
            .await
            .expect("guest source should save")
            .expect("guest source should be valid");

        let second_session =
            promote_test_session(&store, second_session.id, user_id, "second session").await;
        store
            .migrate_session_data_to_user(second_session.id, user_id)
            .await
            .expect("second session data should merge");
        let second_owner = OwnerScope::from_session(&second_session);

        let items = store
            .list_memory_items(second_owner, "aiko")
            .await
            .expect("account memories should list");
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].id, account_memory.id);
        assert!((items[0].confidence - 0.95).abs() < 0.001);
        let sources = store
            .list_memory_sources(second_owner, items[0].id)
            .await
            .expect("merged sources should list");
        assert_eq!(sources.len(), 2);
        let retrieval = store
            .find_memory_retrieval_candidates(
                second_owner,
                "aiko",
                &["travel".to_owned(), "food".to_owned()],
                50,
            )
            .await
            .expect("promoted account retrieval should query");
        assert_eq!(retrieval.len(), 1);
        assert_eq!(retrieval[0].id, account_memory.id);

        cleanup_sessions(&store, &[first_session.id, second_session.id]).await;
    }

    #[tokio::test]
    async fn deleting_chats_recalculates_then_removes_sourced_memory() {
        let Some(store) = test_store().await else {
            return;
        };
        let session = create_test_session(&store).await;
        let owner = OwnerScope::from_session(&session);
        let strong_chat = create_test_chat(&store, owner).await;
        let remaining_chat = create_test_chat(&store, owner).await;
        let memory = store
            .upsert_memory_item(
                owner,
                test_memory(
                    "aiko",
                    "travel.food.preference",
                    "Likes spicy ramen while travelling",
                    0.5,
                ),
            )
            .await
            .expect("memory should save");
        store
            .add_memory_source(owner, memory.id, strong_chat.id, None, 0.9)
            .await
            .expect("strong source should save")
            .expect("strong source should be valid");
        store
            .add_memory_source(owner, memory.id, remaining_chat.id, None, 0.6)
            .await
            .expect("remaining source should save")
            .expect("remaining source should be valid");

        assert!(store
            .delete_chat(owner, strong_chat.id)
            .await
            .expect("first chat should delete"));
        let items = store
            .list_memory_items(owner, "aiko")
            .await
            .expect("memory should remain");
        assert_eq!(items.len(), 1);
        assert!((items[0].confidence - 0.6).abs() < 0.001);
        let sources = store
            .list_memory_sources(owner, memory.id)
            .await
            .expect("remaining sources should list");
        assert_eq!(sources.len(), 1);
        assert_eq!(sources[0].chat_id, remaining_chat.id);

        assert!(store
            .delete_chat(owner, remaining_chat.id)
            .await
            .expect("second chat should delete"));
        let items = store
            .list_memory_items(owner, "aiko")
            .await
            .expect("orphan cleanup should list");
        assert!(items.is_empty());

        cleanup_sessions(&store, &[session.id]).await;
    }

    #[tokio::test]
    async fn clearing_chat_messages_removes_message_sourced_memory() {
        let Some(store) = test_store().await else {
            return;
        };
        let session = create_test_session(&store).await;
        let owner = OwnerScope::from_session(&session);
        let chat = create_test_chat(&store, owner).await;
        let user_message = StoredMessage {
            id: Uuid::new_v4(),
            role: AiRole::User,
            content: "I like spicy ramen".to_owned(),
            attachments: Vec::new(),
            created_at: now_unix_seconds(),
        };
        let assistant_message = StoredMessage {
            id: Uuid::new_v4(),
            role: AiRole::Assistant,
            content: "I will keep that in mind".to_owned(),
            attachments: Vec::new(),
            created_at: now_unix_seconds(),
        };
        store
            .append_chat_messages(owner, chat.id, user_message.clone(), assistant_message)
            .await
            .expect("messages should append")
            .expect("chat should exist");
        let memory = store
            .upsert_memory_item(
                owner,
                test_memory(
                    "aiko",
                    "travel.food.preference",
                    "Likes spicy ramen while travelling",
                    0.8,
                ),
            )
            .await
            .expect("memory should save");
        store
            .add_memory_source(owner, memory.id, chat.id, Some(user_message.id), 0.8)
            .await
            .expect("message source should save")
            .expect("message source should be valid");

        let cleared = store
            .clear_chat_messages(owner, chat.id)
            .await
            .expect("chat messages should clear")
            .expect("chat should remain");
        assert!(cleared.messages.is_empty());
        assert!(store
            .list_memory_items(owner, "aiko")
            .await
            .expect("memory should list")
            .is_empty());

        cleanup_sessions(&store, &[session.id]).await;
    }

    #[tokio::test]
    async fn persisted_turn_enqueues_exactly_one_extraction_job() {
        let Some(store) = test_store().await else {
            return;
        };
        let session = create_test_session(&store).await;
        let owner = OwnerScope::from_session(&session);
        let chat = create_test_chat(&store, owner).await;
        let (user, assistant) = append_test_turn(&store, owner, chat.id, "I like ramen").await;

        sqlx::query(
            "insert into memory_extraction_jobs (
                id, chat_id, user_message_id, assistant_message_id,
                owner_session_id, owner_user_id, character_id
             ) values ($1, $2, $3, $4, $5, $6, 'aiko')
             on conflict (user_message_id) do nothing",
        )
        .bind(Uuid::new_v4())
        .bind(chat.id)
        .bind(user.id)
        .bind(assistant.id)
        .bind(owner.session_id)
        .bind(owner.user_id)
        .execute(store.db.as_ref())
        .await
        .expect("duplicate enqueue should be idempotent");
        let count: i64 = sqlx::query_scalar(
            "select count(*) from memory_extraction_jobs where user_message_id = $1",
        )
        .bind(user.id)
        .fetch_one(store.db.as_ref())
        .await
        .expect("job count should query");
        assert_eq!(count, 1);
        cleanup_sessions(&store, &[session.id]).await;
    }

    #[tokio::test]
    async fn capture_is_atomic_reinforces_and_replaces_corrected_value() {
        let Some(store) = test_store().await else {
            return;
        };
        let session = create_test_session(&store).await;
        let owner = OwnerScope::from_session(&session);
        let first_chat = create_test_chat(&store, owner).await;
        let (first_user, _) =
            append_test_turn(&store, owner, first_chat.id, "I like spicy ramen").await;
        let first_job = store
            .claim_memory_extraction_job_for_test(first_user.id)
            .await
            .expect("first job should claim")
            .expect("first job should exist");
        assert_eq!(first_job.user_message_id, first_user.id);
        assert!(store
            .apply_memory_capture(first_job.id, &[captured_memory("Likes spicy ramen", false)])
            .await
            .expect("first capture should persist"));

        let second_chat = create_test_chat(&store, owner).await;
        let (second_user, _) =
            append_test_turn(&store, owner, second_chat.id, "I still like spicy ramen").await;
        let second_job = store
            .claim_memory_extraction_job_for_test(second_user.id)
            .await
            .expect("second job should claim")
            .expect("second job should exist");
        store
            .apply_memory_capture(
                second_job.id,
                &[captured_memory("Likes spicy ramen", false)],
            )
            .await
            .expect("reinforcement should persist");
        let items = store
            .list_memory_items(owner, "aiko")
            .await
            .expect("reinforced memory should list");
        assert_eq!(items.len(), 1);
        assert!((items[0].confidence - 0.85).abs() < 0.001);
        assert_eq!(
            store
                .list_memory_sources(owner, items[0].id)
                .await
                .expect("sources should list")
                .len(),
            2
        );

        let correction_chat = create_test_chat(&store, owner).await;
        let (correction_user, _) = append_test_turn(
            &store,
            owner,
            correction_chat.id,
            "Correction: I now prefer mild ramen",
        )
        .await;
        let correction_job = store
            .claim_memory_extraction_job_for_test(correction_user.id)
            .await
            .expect("correction job should claim")
            .expect("correction job should exist");
        store
            .apply_memory_capture(
                correction_job.id,
                &[captured_memory("Prefers mild ramen", true)],
            )
            .await
            .expect("correction should persist");
        let corrected = store
            .list_memory_items(owner, "aiko")
            .await
            .expect("corrected memory should list");
        assert_eq!(corrected.len(), 1);
        assert_eq!(corrected[0].content, "Prefers mild ramen");
        let sources = store
            .list_memory_sources(owner, corrected[0].id)
            .await
            .expect("corrected source should list");
        assert_eq!(sources.len(), 1);
        assert_eq!(sources[0].message_id, Some(correction_user.id));
        cleanup_sessions(&store, &[session.id]).await;
    }

    #[tokio::test]
    async fn extraction_job_retries_are_bounded() {
        let Some(store) = test_store().await else {
            return;
        };
        let session = create_test_session(&store).await;
        let owner = OwnerScope::from_session(&session);
        let chat = create_test_chat(&store, owner).await;
        let (user, _) = append_test_turn(&store, owner, chat.id, "I like ramen").await;

        for attempt in 1..=3 {
            let job = store
                .claim_memory_extraction_job_for_test(user.id)
                .await
                .expect("job should claim")
                .expect("retry job should exist");
            assert_eq!(job.attempts, attempt);
            let status = store
                .fail_memory_extraction_job(job.id, "invalid_structured_output")
                .await
                .expect("failure should save")
                .expect("job should update");
            if attempt < 3 {
                assert_eq!(status, "retry");
                sqlx::query("update memory_extraction_jobs set available_at = now() where id = $1")
                    .bind(job.id)
                    .execute(store.db.as_ref())
                    .await
                    .expect("retry should become available");
            } else {
                assert_eq!(status, "dead");
            }
        }
        assert!(store
            .claim_memory_extraction_job_for_test(user.id)
            .await
            .expect("empty queue should query")
            .is_none());
        cleanup_sessions(&store, &[session.id]).await;
    }

    #[tokio::test]
    async fn pending_guest_capture_follows_account_promotion() {
        let Some(store) = test_store().await else {
            return;
        };
        let user_id = Uuid::new_v4();
        let guest = create_test_session(&store).await;
        let guest_owner = OwnerScope::from_session(&guest);
        let chat = create_test_chat(&store, guest_owner).await;
        let (user, _) = append_test_turn(&store, guest_owner, chat.id, "I like spicy ramen").await;

        let registered = promote_test_session(&store, guest.id, user_id, "capture session").await;
        store
            .migrate_session_data_to_user(registered.id, user_id)
            .await
            .expect("capture ownership should migrate");
        let registered_owner = OwnerScope::from_session(&registered);
        let job = store
            .claim_memory_extraction_job_for_test(user.id)
            .await
            .expect("promoted job should claim")
            .expect("promoted job should exist");
        assert_eq!(job.owner_user_id, Some(user_id));
        store
            .apply_memory_capture(job.id, &[captured_memory("Likes spicy ramen", false)])
            .await
            .expect("promoted capture should persist");
        let items = store
            .list_memory_items(registered_owner, "aiko")
            .await
            .expect("registered memory should list");
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].owner_user_id, Some(user_id));
        cleanup_sessions(&store, &[guest.id]).await;
    }

    #[tokio::test]
    async fn hard_reset_removes_learned_context_but_keeps_chats() {
        let Some(store) = test_store().await else {
            return;
        };
        let session = create_test_session(&store).await;
        let owner = OwnerScope::from_session(&session);
        let chat = create_test_chat(&store, owner).await;
        store
            .upsert_memory_item(
                owner,
                test_memory("aiko", "travel.food.preference", "Likes ramen", 0.8),
            )
            .await
            .expect("first memory should save");
        store
            .upsert_memory_item(
                owner,
                test_memory("other", "profile.language", "Prefers Thai", 0.9),
            )
            .await
            .expect("second memory should save");

        let deleted = store
            .reset_learned_context(owner)
            .await
            .expect("learned context should reset");
        assert_eq!(deleted, 2);
        assert!(store
            .list_memory_items(owner, "aiko")
            .await
            .expect("aiko memory should list")
            .is_empty());
        assert!(store
            .get_chat(owner, chat.id)
            .await
            .expect("chat should query")
            .is_some());

        cleanup_sessions(&store, &[session.id]).await;
    }

    #[tokio::test]
    async fn user_profile_is_seeded_once_and_then_editable() {
        let Some(store) = test_store().await else {
            return;
        };
        let user_id = Uuid::new_v4();
        let session = create_test_session(&store).await;
        let session = promote_test_session(&store, session.id, user_id, "session").await;

        store
            .upsert_auth_identity(
                user_id,
                "google",
                "google-subject",
                Some("first@example.com".to_owned()),
                Some("Google Name".to_owned()),
                Some("https://example.com/google.png".to_owned()),
            )
            .await
            .expect("identity should save");
        let profile = store
            .ensure_user_profile(
                user_id,
                Some("Google Name".to_owned()),
                Some("https://example.com/google.png".to_owned()),
            )
            .await
            .expect("profile should seed query")
            .expect("profile should seed");
        assert_eq!(profile.display_name, "Google Name");
        assert_eq!(
            profile.avatar_url.as_deref(),
            Some("https://example.com/google.png")
        );

        let updated = store
            .update_user_profile(
                user_id,
                Some("Custom Name".to_owned()),
                Some("https://example.com/custom.png".to_owned()),
            )
            .await
            .expect("profile should update query")
            .expect("profile should update");
        assert_eq!(updated.display_name, "Custom Name");
        assert_eq!(
            updated.avatar_url.as_deref(),
            Some("https://example.com/custom.png")
        );

        let profile = store
            .ensure_user_profile(
                user_id,
                Some("New Google Name".to_owned()),
                Some("https://example.com/new-google.png".to_owned()),
            )
            .await
            .expect("profile should remain custom query")
            .expect("profile should remain custom");
        assert_eq!(profile.display_name, "Custom Name");
        assert_eq!(
            profile.avatar_url.as_deref(),
            Some("https://example.com/custom.png")
        );

        cleanup_sessions(&store, &[session.id]).await;
        cleanup_users(&store, &[user_id]).await;
    }
}
