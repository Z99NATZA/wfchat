#[cfg(test)]
use std::sync::atomic::AtomicUsize;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{PgPool, Postgres, Row, Transaction};
use uuid::Uuid;

use crate::ai::{AiMessage, AiRole};

mod attachments;
mod auth;
mod cafe;
mod chat;
mod memory;
mod quota;
mod sync;

use memory::{cleanup_memory_after_source_removal, recalculate_memory_evidence};
pub type StoreResult<T> = Result<T, sqlx::Error>;

#[derive(Clone)]
pub struct ChatStore {
    db: Arc<PgPool>,
    #[cfg(test)]
    auth_sessions_created: Arc<AtomicUsize>,
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
pub struct ChatSummaryRecord {
    pub id: Uuid,
    pub character_id: String,
    pub last_message: String,
    pub created_at: u64,
    pub updated_at: u64,
}

#[derive(Clone, Copy, Debug)]
pub struct ChatStorageLimits {
    pub max_chats_per_owner: usize,
    pub max_messages_per_chat: usize,
    pub max_stored_chars_per_chat: usize,
}

impl Default for ChatStorageLimits {
    fn default() -> Self {
        Self {
            max_chats_per_owner: 50,
            max_messages_per_chat: 100,
            max_stored_chars_per_chat: 500_000,
        }
    }
}

#[derive(Clone, Debug)]
pub enum CreateChatOutcome {
    Created(ChatRecord),
    FollowUpUnavailable,
    ChatLimitReached,
    MessageLimitReached,
}

#[derive(Clone, Debug)]
pub enum AppendChatMessagesOutcome {
    Appended {
        user_message: StoredMessage,
        assistant_message: StoredMessage,
    },
    Unavailable,
    LimitReached,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ChatGenerationQuotaReservation {
    pub id: Uuid,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ChatGenerationQuotaAdmission {
    Admitted(ChatGenerationQuotaReservation),
    SessionUnavailable,
    OwnerLimitReached { retry_after_seconds: u64 },
    GlobalLimitReached { retry_after_seconds: u64 },
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

#[derive(Clone, Debug)]
pub enum CreateChatAttachmentOutcome {
    Created(Box<ChatAttachmentRecord>),
    StorageQuotaExceeded,
}

#[derive(Clone, Debug)]
pub struct ChatAttachmentFileDeletionRecord {
    pub storage_key: String,
    pub byte_size: i64,
    pub owner_session_id: Option<Uuid>,
    pub owner_user_id: Option<Uuid>,
    pub attempt_count: i32,
    pub claim_token: Uuid,
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
pub struct MemoryFollowUpRecord {
    pub id: Uuid,
    pub memory_id: Uuid,
    pub character_id: String,
    pub prompt: String,
    pub shown_at: u64,
    pub chat_id: Option<Uuid>,
}

#[derive(Clone, Copy, Debug)]
pub struct MemoryFollowUpClaim<'a> {
    pub claim_key: Uuid,
    pub memory_id: Uuid,
    pub character_id: &'a str,
    pub expected_updated_at: u64,
    pub prompt: &'a str,
    pub shown_at: u64,
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
    pub user_timezone: String,
    pub captured_at: u64,
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
    pub expires_at: Option<u64>,
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

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct CafeProgressRecord {
    pub cafe_stars: u32,
    pub unlocked_cosmetics: Vec<String>,
    pub equipped_cosmetic: Option<String>,
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

    static INACTIVE_GUEST_CLEANUP_TEST_LOCK: tokio::sync::Mutex<()> =
        tokio::sync::Mutex::const_new(());

    async fn test_store() -> Option<ChatStore> {
        let database_url = std::env::var("WFCHAT_TEST_DATABASE_URL").ok()?;
        Some(
            ChatStore::connect(&database_url)
                .await
                .expect("WFCHAT_TEST_DATABASE_URL should identify a reachable test database"),
        )
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

    fn follow_up_memory(memory_key: &str, content: &str) -> NewMemoryItemRecord {
        NewMemoryItemRecord {
            character_id: "aiko".to_owned(),
            memory_key: memory_key.to_owned(),
            kind: "plan".to_owned(),
            content: content.to_owned(),
            tags: vec!["career".to_owned()],
            confidence: 0.9,
            importance: 0.85,
            last_reinforced_at: now_unix_seconds(),
            expires_at: None,
        }
    }

    #[tokio::test]
    async fn follow_up_claim_is_idempotent_rate_limited_and_persisted_with_chat() {
        let Some(store) = test_store().await else {
            return;
        };
        let session = create_test_session(&store).await;
        let owner = OwnerScope::from_session(&session);
        let first_memory = store
            .upsert_memory_item(
                owner,
                follow_up_memory("career.interview.plan", "Has a job interview tomorrow"),
            )
            .await
            .expect("follow-up memory should save");
        let now = now_unix_seconds();
        let claim_key = Uuid::new_v4();
        let first = store
            .claim_memory_follow_up(
                owner,
                MemoryFollowUpClaim {
                    claim_key,
                    memory_id: first_memory.id,
                    character_id: "aiko",
                    expected_updated_at: first_memory.updated_at,
                    prompt: "How did the interview go?",
                    shown_at: now,
                },
            )
            .await
            .expect("follow-up claim should query")
            .expect("follow-up should claim");
        let retried = store
            .claim_memory_follow_up(
                owner,
                MemoryFollowUpClaim {
                    claim_key,
                    memory_id: first_memory.id,
                    character_id: "aiko",
                    expected_updated_at: first_memory.updated_at,
                    prompt: "How did the interview go?",
                    shown_at: now,
                },
            )
            .await
            .expect("idempotent follow-up claim should query")
            .expect("same claim key should return the delivery");
        assert_eq!(retried.id, first.id);

        let second_memory = store
            .upsert_memory_item(
                owner,
                follow_up_memory("career.application.plan", "Plans to submit an application"),
            )
            .await
            .expect("second memory should save");
        let blocked = store
            .claim_memory_follow_up(
                owner,
                MemoryFollowUpClaim {
                    claim_key: Uuid::new_v4(),
                    memory_id: second_memory.id,
                    character_id: "aiko",
                    expected_updated_at: second_memory.updated_at,
                    prompt: "Did you submit the application?",
                    shown_at: now,
                },
            )
            .await
            .expect("rate-limited claim should query");
        assert!(blocked.is_none());

        let chat = store
            .create_chat_with_follow_up(
                owner,
                "aiko".to_owned(),
                "aiko_default".to_owned(),
                Some(first.id),
            )
            .await
            .expect("chat with follow-up should query")
            .expect("follow-up should attach to a new chat");
        assert_eq!(chat.messages.len(), 1);
        assert_eq!(chat.messages[0].role, AiRole::Assistant);
        assert_eq!(chat.messages[0].content, "How did the interview go?");

        cleanup_sessions(&store, &[session.id]).await;
    }

    #[tokio::test]
    async fn follow_up_chat_limits_are_distinct_and_leave_no_chat_or_claim_link() {
        let Some(store) = test_store().await else {
            return;
        };
        let session = create_test_session(&store).await;
        let owner = OwnerScope::from_session(&session);
        let memory = store
            .upsert_memory_item(
                owner,
                follow_up_memory("career.follow-up.limit", "Plans to apply tomorrow"),
            )
            .await
            .unwrap();
        let follow_up = store
            .claim_memory_follow_up(
                owner,
                MemoryFollowUpClaim {
                    claim_key: Uuid::new_v4(),
                    memory_id: memory.id,
                    character_id: "aiko",
                    expected_updated_at: memory.updated_at,
                    prompt: "Did you apply?",
                    shown_at: now_unix_seconds(),
                },
            )
            .await
            .unwrap()
            .expect("follow-up should claim");

        let message_limited = store
            .create_chat_with_follow_up_limited(
                owner,
                "aiko".to_owned(),
                "aiko_default".to_owned(),
                Some(follow_up.id),
                ChatStorageLimits {
                    max_chats_per_owner: 1,
                    max_messages_per_chat: 0,
                    max_stored_chars_per_chat: 500_000,
                },
            )
            .await
            .unwrap();
        assert!(matches!(
            message_limited,
            CreateChatOutcome::MessageLimitReached
        ));

        let chat_limited = store
            .create_chat_with_follow_up_limited(
                owner,
                "aiko".to_owned(),
                "aiko_default".to_owned(),
                Some(follow_up.id),
                ChatStorageLimits {
                    max_chats_per_owner: 0,
                    ..ChatStorageLimits::default()
                },
            )
            .await
            .unwrap();
        assert!(matches!(chat_limited, CreateChatOutcome::ChatLimitReached));

        let chat_count: i64 =
            sqlx::query_scalar("select count(*)::bigint from chats where owner_session_id = $1")
                .bind(session.id)
                .fetch_one(store.db.as_ref())
                .await
                .unwrap();
        let linked_chat_id: Option<Uuid> =
            sqlx::query_scalar("select chat_id from memory_follow_up_deliveries where id = $1")
                .bind(follow_up.id)
                .fetch_one(store.db.as_ref())
                .await
                .unwrap();
        assert_eq!(chat_count, 0);
        assert_eq!(linked_chat_id, None);

        cleanup_sessions(&store, &[session.id]).await;
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

    fn stored_message(role: AiRole, content: &str) -> StoredMessage {
        StoredMessage {
            id: Uuid::new_v4(),
            role,
            content: content.to_owned(),
            attachments: Vec::new(),
            created_at: now_unix_seconds(),
        }
    }

    fn captured_memory(content: &str, replaces_existing: bool) -> CapturedMemoryRecord {
        CapturedMemoryRecord {
            memory_key: "food.spice.preference".to_owned(),
            kind: "preference".to_owned(),
            content: content.to_owned(),
            tags: vec!["food".to_owned(), "spicy".to_owned()],
            importance: 0.8,
            evidence_strength: 0.8,
            expires_at: None,
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
    async fn inactive_guest_cleanup_cascades_guest_data_but_keeps_registered_rows() {
        let _cleanup_guard = INACTIVE_GUEST_CLEANUP_TEST_LOCK.lock().await;
        let Some(store) = test_store().await else {
            return;
        };
        let guest = create_test_session(&store).await;
        let guest_chat = create_test_chat(&store, OwnerScope::from_session(&guest)).await;
        let guest_attachment_id = Uuid::new_v4();
        let guest_attachment_key = format!("chat-images/{guest_attachment_id}.png");
        store
            .create_chat_attachment(
                OwnerScope::from_session(&guest),
                NewChatAttachmentRecord {
                    id: guest_attachment_id,
                    kind: "image".to_owned(),
                    mime_type: "image/png".to_owned(),
                    byte_size: 73,
                    width: Some(1),
                    height: Some(1),
                    sha256: "guest-cleanup".to_owned(),
                    storage_key: guest_attachment_key.clone(),
                },
            )
            .await
            .unwrap();
        let guest_sync_item_id = format!("cleanup-guest-sync-{}", Uuid::new_v4());
        store
            .upsert_sync_entity(&SyncEntityRecord {
                session_id: guest.id,
                owner_user_id: None,
                item_id: guest_sync_item_id.clone(),
                item_type: "setting".to_owned(),
                updated_at: now_unix_seconds(),
                deleted_at: None,
                payload: json!({"guest": true}),
            })
            .await
            .unwrap();
        let guest_sync_operation_id = format!("cleanup-guest-op-{}", Uuid::new_v4());
        store
            .save_sync_commit(guest.id, guest.user_id, &guest_sync_operation_id, 1, 0)
            .await
            .unwrap();
        let registered_seed = create_test_session(&store).await;
        let registered = promote_test_session(
            &store,
            registered_seed.id,
            Uuid::new_v4(),
            "registered cleanup control",
        )
        .await;
        let registered_chat = create_test_chat(&store, OwnerScope::from_session(&registered)).await;
        let promoted_guest = create_test_session(&store).await;
        let promoted_chat =
            create_test_chat(&store, OwnerScope::from_session(&promoted_guest)).await;
        let promoted_user_id = Uuid::new_v4();
        let promoted = store
            .promote_guest_session_with_google(
                promoted_guest.id,
                promoted_user_id,
                &format!("cleanup-promotion-{}", Uuid::new_v4()),
                Some("cleanup@example.com".to_owned()),
                Some("Cleanup User".to_owned()),
                None,
            )
            .await
            .unwrap()
            .expect("guest promotion should create a replacement session");
        let legacy_promoted_guest = create_test_session(&store).await;
        let legacy_promoted_chat =
            create_test_chat(&store, OwnerScope::from_session(&legacy_promoted_guest)).await;
        sqlx::query("update chats set owner_user_id = $1 where id = $2")
            .bind(Uuid::new_v4())
            .bind(legacy_promoted_chat.id)
            .execute(store.db.as_ref())
            .await
            .unwrap();
        store.revoke_session(guest.id).await.unwrap();
        store.revoke_session(registered.id).await.unwrap();
        store
            .revoke_session(legacy_promoted_guest.id)
            .await
            .unwrap();

        let cleaned = store.cleanup_inactive_guest_sessions().await.unwrap();
        assert!(cleaned >= 1);

        let guest_session_exists: bool =
            sqlx::query_scalar("select exists(select 1 from auth_sessions where id = $1)")
                .bind(guest.id)
                .fetch_one(store.db.as_ref())
                .await
                .unwrap();
        let guest_chat_exists: bool =
            sqlx::query_scalar("select exists(select 1 from chats where id = $1)")
                .bind(guest_chat.id)
                .fetch_one(store.db.as_ref())
                .await
                .unwrap();
        let registered_session_exists: bool =
            sqlx::query_scalar("select exists(select 1 from auth_sessions where id = $1)")
                .bind(registered.id)
                .fetch_one(store.db.as_ref())
                .await
                .unwrap();
        let registered_chat_exists: bool =
            sqlx::query_scalar("select exists(select 1 from chats where id = $1)")
                .bind(registered_chat.id)
                .fetch_one(store.db.as_ref())
                .await
                .unwrap();
        let promoted_guest_exists: bool =
            sqlx::query_scalar("select exists(select 1 from auth_sessions where id = $1)")
                .bind(promoted_guest.id)
                .fetch_one(store.db.as_ref())
                .await
                .unwrap();
        let legacy_promoted_guest_exists: bool =
            sqlx::query_scalar("select exists(select 1 from auth_sessions where id = $1)")
                .bind(legacy_promoted_guest.id)
                .fetch_one(store.db.as_ref())
                .await
                .unwrap();
        assert!(!guest_session_exists);
        assert!(!guest_chat_exists);
        let deletion_snapshot: (i64, Option<Uuid>, Option<Uuid>) = sqlx::query_as(
            "select byte_size, owner_session_id, owner_user_id
             from chat_attachment_file_deletions where storage_key = $1",
        )
        .bind(&guest_attachment_key)
        .fetch_one(store.db.as_ref())
        .await
        .unwrap();
        assert_eq!(deletion_snapshot, (73, Some(guest.id), None));
        assert!(!sqlx::query_scalar::<_, bool>(
            "select exists(select 1 from sync_entities where item_id = $1)",
        )
        .bind(&guest_sync_item_id)
        .fetch_one(store.db.as_ref())
        .await
        .unwrap());
        assert!(!sqlx::query_scalar::<_, bool>(
            "select exists(select 1 from sync_commits where operation_id = $1)",
        )
        .bind(&guest_sync_operation_id)
        .fetch_one(store.db.as_ref())
        .await
        .unwrap());
        assert!(registered_session_exists);
        assert!(registered_chat_exists);
        assert!(!promoted_guest_exists);
        assert!(legacy_promoted_guest_exists);
        assert!(
            sqlx::query_scalar::<_, bool>("select exists(select 1 from chats where id = $1)")
                .bind(legacy_promoted_chat.id)
                .fetch_one(store.db.as_ref())
                .await
                .unwrap()
        );
        assert!(store
            .get_chat(OwnerScope::from_session(&promoted), promoted_chat.id)
            .await
            .unwrap()
            .is_some());

        cleanup_sessions(
            &store,
            &[registered.id, promoted.id, legacy_promoted_guest.id],
        )
        .await;
        cleanup_users(&store, &[promoted_user_id]).await;
        sqlx::query("delete from chat_attachment_file_deletions where storage_key = $1")
            .bind(&guest_attachment_key)
            .execute(store.db.as_ref())
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn legacy_promoted_guest_cleanup_reparents_all_account_data_and_is_bounded() {
        let _cleanup_guard = INACTIVE_GUEST_CLEANUP_TEST_LOCK.lock().await;
        let Some(store) = test_store().await else {
            return;
        };
        let account_user_id = Uuid::new_v4();
        let registered_seed = create_test_session(&store).await;
        let registered = promote_test_session(
            &store,
            registered_seed.id,
            account_user_id,
            "legacy cleanup target",
        )
        .await;
        let registered_owner = OwnerScope::from_session(&registered);
        let legacy = create_test_session(&store).await;
        let legacy_owner = OwnerScope {
            session_id: legacy.id,
            user_id: Some(account_user_id),
        };
        let chat = create_test_chat(&store, legacy_owner).await;
        let user_message = stored_message(AiRole::User, "legacy user message");
        let assistant_message = stored_message(AiRole::Assistant, "legacy assistant message");
        store
            .append_chat_messages_with_attachments_and_timezone(
                legacy_owner,
                chat.id,
                user_message.clone(),
                assistant_message,
                &[],
                "Asia/Bangkok",
            )
            .await
            .unwrap()
            .expect("legacy chat turn should append");
        let attachment_id = Uuid::new_v4();
        sqlx::query(
            "insert into chat_attachments (
                id, owner_session_id, owner_user_id, chat_id, message_id, kind,
                mime_type, byte_size, sha256, storage_key
             ) values ($1, $2, $3, $4, $5, 'image', 'image/png', 4, 'legacy', $6)",
        )
        .bind(attachment_id)
        .bind(legacy.id)
        .bind(account_user_id)
        .bind(chat.id)
        .bind(user_message.id)
        .bind(format!("legacy/{}.png", attachment_id))
        .execute(store.db.as_ref())
        .await
        .unwrap();
        let legacy_deletion_key = format!("chat-images/{}.png", Uuid::new_v4());
        sqlx::query(
            "insert into chat_attachment_file_deletions (
                storage_key, byte_size, owner_session_id, owner_user_id
             ) values ($1, 5, $2, $3)",
        )
        .bind(&legacy_deletion_key)
        .bind(legacy.id)
        .bind(account_user_id)
        .execute(store.db.as_ref())
        .await
        .unwrap();
        let memory = store
            .upsert_memory_item(
                legacy_owner,
                follow_up_memory("legacy.account.plan", "Plans to visit Bangkok"),
            )
            .await
            .unwrap();
        let follow_up = store
            .claim_memory_follow_up(
                legacy_owner,
                MemoryFollowUpClaim {
                    claim_key: Uuid::new_v4(),
                    memory_id: memory.id,
                    character_id: "aiko",
                    expected_updated_at: memory.updated_at,
                    prompt: "How was Bangkok?",
                    shown_at: now_unix_seconds(),
                },
            )
            .await
            .unwrap()
            .expect("legacy follow-up should claim");
        store.add_cafe_stars(legacy_owner, 2).await.unwrap();
        assert!(store.equip_cafe_cosmetic(legacy_owner, None).await.unwrap());
        let room_id = Uuid::new_v4();
        store
            .award_cafe_round_completion(room_id, 1, &[legacy_owner])
            .await
            .unwrap();
        let sync_item_id = format!("legacy.sync.{}", Uuid::new_v4());
        store
            .upsert_sync_entity(&SyncEntityRecord {
                session_id: legacy.id,
                owner_user_id: Some(account_user_id),
                item_id: sync_item_id.clone(),
                item_type: "setting".to_owned(),
                updated_at: now_unix_seconds(),
                deleted_at: None,
                payload: json!({"enabled": true}),
            })
            .await
            .unwrap();
        let operation_id = format!("legacy-op-{}", Uuid::new_v4());
        store
            .save_sync_commit(legacy.id, legacy.user_id, &operation_id, 1, 0)
            .await
            .unwrap();
        store.revoke_session(legacy.id).await.unwrap();

        let cleaned = store.cleanup_inactive_guest_sessions().await.unwrap();
        assert!(cleaned <= 1_000);
        assert!(!sqlx::query_scalar::<_, bool>(
            "select exists(select 1 from auth_sessions where id = $1)",
        )
        .bind(legacy.id)
        .fetch_one(store.db.as_ref())
        .await
        .unwrap());
        assert!(store
            .get_chat(registered_owner, chat.id)
            .await
            .unwrap()
            .is_some());
        assert!(store
            .list_memory_items(registered_owner, "aiko")
            .await
            .unwrap()
            .iter()
            .any(|item| item.id == memory.id));
        assert_eq!(
            store
                .get_cafe_progress(registered_owner)
                .await
                .unwrap()
                .cafe_stars,
            3
        );
        assert!(store
            .list_sync_entities_since(registered_owner, 0, 500)
            .await
            .unwrap()
            .iter()
            .any(|item| item.item_id == sync_item_id));

        for (table, column, key_column, key) in [
            ("chat_attachments", "owner_session_id", "id", attachment_id),
            ("memory_items", "owner_session_id", "id", memory.id),
            (
                "memory_follow_up_deliveries",
                "owner_session_id",
                "id",
                follow_up.id,
            ),
        ] {
            let query = format!("select {column} from {table} where {key_column} = $1");
            let owner_session_id: Uuid = sqlx::query_scalar(&query)
                .bind(key)
                .fetch_one(store.db.as_ref())
                .await
                .unwrap();
            assert_eq!(owner_session_id, registered.id, "{table}");
        }
        let extraction_owner: Uuid = sqlx::query_scalar(
            "select owner_session_id from memory_extraction_jobs where chat_id = $1",
        )
        .bind(chat.id)
        .fetch_one(store.db.as_ref())
        .await
        .unwrap();
        let reward_owner: Uuid = sqlx::query_scalar(
            "select owner_session_id from cafe_room_rewards where room_id = $1 and round_number = 1",
        )
        .bind(room_id)
        .fetch_one(store.db.as_ref())
        .await
        .unwrap();
        let sync_commit_owner: Uuid =
            sqlx::query_scalar("select session_id from sync_commits where operation_id = $1")
                .bind(&operation_id)
                .fetch_one(store.db.as_ref())
                .await
                .unwrap();
        assert_eq!(extraction_owner, registered.id);
        assert_eq!(reward_owner, registered.id);
        assert_eq!(sync_commit_owner, registered.id);
        let sync_commit_user: Uuid =
            sqlx::query_scalar("select user_id from sync_commits where operation_id = $1")
                .bind(&operation_id)
                .fetch_one(store.db.as_ref())
                .await
                .unwrap();
        assert_eq!(sync_commit_user, account_user_id);
        let deletion_owner: (Option<Uuid>, Option<Uuid>) = sqlx::query_as(
            "select owner_session_id, owner_user_id
             from chat_attachment_file_deletions where storage_key = $1",
        )
        .bind(&legacy_deletion_key)
        .fetch_one(store.db.as_ref())
        .await
        .unwrap();
        assert_eq!(deletion_owner, (Some(registered.id), Some(account_user_id)));
        assert!(sqlx::query_scalar::<_, bool>(
            "select exists(select 1 from cafe_cosmetic_loadouts where owner_session_id = $1)",
        )
        .bind(registered.id)
        .fetch_one(store.db.as_ref())
        .await
        .unwrap());

        let batch_ids = (0..1_001).map(|_| Uuid::new_v4()).collect::<Vec<_>>();
        let batch_user_ids = (0..1_001).map(|_| Uuid::new_v4()).collect::<Vec<_>>();
        sqlx::query(
            "insert into auth_sessions (id, user_id, kind, created_at, expires_at, revoked_at)
             select id, user_id, 'guest', timestamp '1969-01-01', timestamp '1969-01-02', timestamp '1969-01-02'
             from unnest($1::uuid[], $2::uuid[]) as batch(id, user_id)",
        )
        .bind(&batch_ids)
        .bind(&batch_user_ids)
        .execute(store.db.as_ref())
        .await
        .unwrap();
        let batch_cleaned = store.cleanup_inactive_guest_sessions().await.unwrap();
        assert!(batch_cleaned <= 1_000);
        let remaining: i64 =
            sqlx::query_scalar("select count(*)::bigint from auth_sessions where id = any($1)")
                .bind(&batch_ids)
                .fetch_one(store.db.as_ref())
                .await
                .unwrap();
        assert!(remaining >= 1);

        cleanup_sessions(&store, &batch_ids).await;
        cleanup_sessions(&store, &[registered.id]).await;
        sqlx::query("delete from chat_attachment_file_deletions where storage_key = $1")
            .bind(&legacy_deletion_key)
            .execute(store.db.as_ref())
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn legacy_sync_commit_cleanup_reparent_keeps_newer_existing_target_conflict() {
        let _cleanup_guard = INACTIVE_GUEST_CLEANUP_TEST_LOCK.lock().await;
        let Some(store) = test_store().await else {
            return;
        };
        let account_user_id = Uuid::new_v4();
        let registered_seed = create_test_session(&store).await;
        let registered = promote_test_session(
            &store,
            registered_seed.id,
            account_user_id,
            "legacy sync conflict target",
        )
        .await;
        let legacy = create_test_session(&store).await;
        let item_id = format!("legacy-conflict-item-{}", Uuid::new_v4());
        store
            .upsert_sync_entity(&SyncEntityRecord {
                session_id: legacy.id,
                owner_user_id: Some(account_user_id),
                item_id: item_id.clone(),
                item_type: "setting".to_owned(),
                updated_at: now_unix_seconds(),
                deleted_at: None,
                payload: json!({"source": "legacy"}),
            })
            .await
            .unwrap();
        let operation_id = format!("legacy-conflict-op-{}", Uuid::new_v4());
        store
            .save_sync_commit(registered.id, account_user_id, &operation_id, 7, 3)
            .await
            .unwrap();
        store
            .save_sync_commit(legacy.id, legacy.user_id, &operation_id, 1, 0)
            .await
            .unwrap();
        sqlx::query(
            "update sync_commits
             set committed_at = case
                 when session_id = $1 then timestamp '2001-01-01'
                 else timestamp '2000-01-01'
             end
             where operation_id = $2 and session_id in ($1, $3)",
        )
        .bind(registered.id)
        .bind(&operation_id)
        .bind(legacy.id)
        .execute(store.db.as_ref())
        .await
        .unwrap();
        store.revoke_session(legacy.id).await.unwrap();

        store.cleanup_inactive_guest_sessions().await.unwrap();

        assert!(!sqlx::query_scalar::<_, bool>(
            "select exists(select 1 from auth_sessions where id = $1)",
        )
        .bind(legacy.id)
        .fetch_one(store.db.as_ref())
        .await
        .unwrap());
        let entity_session_id: Uuid = sqlx::query_scalar(
            "select session_id from sync_entities where item_id = $1 and session_id = $2",
        )
        .bind(&item_id)
        .bind(registered.id)
        .fetch_one(store.db.as_ref())
        .await
        .unwrap();
        assert_eq!(entity_session_id, registered.id);
        let commit = store
            .get_sync_commit(registered.id, &operation_id)
            .await
            .unwrap()
            .expect("target conflict commit should survive cleanup");
        assert_eq!(commit.user_id, account_user_id);
        assert_eq!(commit.merged_count, 7);
        assert_eq!(commit.conflict_count, 3);
        let commit_count: i64 =
            sqlx::query_scalar("select count(*)::bigint from sync_commits where operation_id = $1")
                .bind(&operation_id)
                .fetch_one(store.db.as_ref())
                .await
                .unwrap();
        assert_eq!(commit_count, 1);

        cleanup_sessions(&store, &[registered.id]).await;
    }

    #[tokio::test]
    async fn legacy_sync_commit_cleanup_preserves_older_existing_target_conflict() {
        let _cleanup_guard = INACTIVE_GUEST_CLEANUP_TEST_LOCK.lock().await;
        let Some(store) = test_store().await else {
            return;
        };
        let account_user_id = Uuid::new_v4();
        let registered_seed = create_test_session(&store).await;
        let registered = promote_test_session(
            &store,
            registered_seed.id,
            account_user_id,
            "older legacy sync conflict target",
        )
        .await;
        let legacy = create_test_session(&store).await;
        let item_id = format!("legacy-older-conflict-item-{}", Uuid::new_v4());
        store
            .upsert_sync_entity(&SyncEntityRecord {
                session_id: legacy.id,
                owner_user_id: Some(account_user_id),
                item_id: item_id.clone(),
                item_type: "setting".to_owned(),
                updated_at: now_unix_seconds(),
                deleted_at: None,
                payload: json!({"source": "newer-legacy"}),
            })
            .await
            .unwrap();
        let operation_id = format!("legacy-older-conflict-op-{}", Uuid::new_v4());
        store
            .save_sync_commit(registered.id, account_user_id, &operation_id, 9, 4)
            .await
            .unwrap();
        store
            .save_sync_commit(legacy.id, legacy.user_id, &operation_id, 1, 0)
            .await
            .unwrap();
        sqlx::query(
            "update sync_commits
             set committed_at = case
                 when session_id = $1 then timestamp '2000-01-01'
                 else timestamp '2001-01-01'
             end
             where operation_id = $2 and session_id in ($1, $3)",
        )
        .bind(registered.id)
        .bind(&operation_id)
        .bind(legacy.id)
        .execute(store.db.as_ref())
        .await
        .unwrap();
        let target_before = store
            .get_sync_commit(registered.id, &operation_id)
            .await
            .unwrap()
            .expect("older target commit should exist before cleanup");
        store.revoke_session(legacy.id).await.unwrap();

        store.cleanup_inactive_guest_sessions().await.unwrap();

        assert!(!sqlx::query_scalar::<_, bool>(
            "select exists(select 1 from auth_sessions where id = $1)",
        )
        .bind(legacy.id)
        .fetch_one(store.db.as_ref())
        .await
        .unwrap());
        let entity_session_id: Uuid = sqlx::query_scalar(
            "select session_id from sync_entities where item_id = $1 and session_id = $2",
        )
        .bind(&item_id)
        .bind(registered.id)
        .fetch_one(store.db.as_ref())
        .await
        .unwrap();
        assert_eq!(entity_session_id, registered.id);
        let target_after = store
            .get_sync_commit(registered.id, &operation_id)
            .await
            .unwrap()
            .expect("older target commit should survive cleanup unchanged");
        assert_eq!(target_after.user_id, target_before.user_id);
        assert_eq!(target_after.merged_count, target_before.merged_count);
        assert_eq!(target_after.conflict_count, target_before.conflict_count);
        assert_eq!(target_after.committed_at, target_before.committed_at);
        assert_eq!(target_after.user_id, account_user_id);
        assert_eq!(target_after.merged_count, 9);
        assert_eq!(target_after.conflict_count, 4);
        let commit_count: i64 =
            sqlx::query_scalar("select count(*)::bigint from sync_commits where operation_id = $1")
                .bind(&operation_id)
                .fetch_one(store.db.as_ref())
                .await
                .unwrap();
        assert_eq!(commit_count, 1);

        cleanup_sessions(&store, &[registered.id]).await;
    }

    #[tokio::test]
    async fn legacy_sync_commit_cleanup_without_safe_account_target_is_retained() {
        let _cleanup_guard = INACTIVE_GUEST_CLEANUP_TEST_LOCK.lock().await;
        let Some(store) = test_store().await else {
            return;
        };
        let legacy = create_test_session(&store).await;
        let first_account_user_id = Uuid::new_v4();
        let second_account_user_id = Uuid::new_v4();
        let first_registered_seed = create_test_session(&store).await;
        let first_registered = promote_test_session(
            &store,
            first_registered_seed.id,
            first_account_user_id,
            "ambiguous legacy target one",
        )
        .await;
        let second_registered_seed = create_test_session(&store).await;
        let second_registered = promote_test_session(
            &store,
            second_registered_seed.id,
            second_account_user_id,
            "ambiguous legacy target two",
        )
        .await;
        let item_ids = [
            format!("legacy-retained-item-one-{}", Uuid::new_v4()),
            format!("legacy-retained-item-two-{}", Uuid::new_v4()),
        ];
        for (item_id, owner_user_id) in item_ids
            .iter()
            .zip([first_account_user_id, second_account_user_id])
        {
            store
                .upsert_sync_entity(&SyncEntityRecord {
                    session_id: legacy.id,
                    owner_user_id: Some(owner_user_id),
                    item_id: item_id.clone(),
                    item_type: "setting".to_owned(),
                    updated_at: now_unix_seconds(),
                    deleted_at: None,
                    payload: json!({"retained": true}),
                })
                .await
                .unwrap();
        }
        let operation_id = format!("legacy-retained-op-{}", Uuid::new_v4());
        store
            .save_sync_commit(legacy.id, legacy.user_id, &operation_id, 1, 0)
            .await
            .unwrap();
        store.revoke_session(legacy.id).await.unwrap();

        store.cleanup_inactive_guest_sessions().await.unwrap();

        assert!(sqlx::query_scalar::<_, bool>(
            "select exists(select 1 from auth_sessions where id = $1)",
        )
        .bind(legacy.id)
        .fetch_one(store.db.as_ref())
        .await
        .unwrap());
        for item_id in &item_ids {
            let entity_session_id: Uuid =
                sqlx::query_scalar("select session_id from sync_entities where item_id = $1")
                    .bind(item_id)
                    .fetch_one(store.db.as_ref())
                    .await
                    .unwrap();
            assert_eq!(entity_session_id, legacy.id);
        }
        let commit = store
            .get_sync_commit(legacy.id, &operation_id)
            .await
            .unwrap()
            .expect("unsafe legacy commit should remain on the guest session");
        assert_eq!(commit.user_id, legacy.user_id);

        cleanup_sessions(
            &store,
            &[legacy.id, first_registered.id, second_registered.id],
        )
        .await;
    }

    #[tokio::test]
    async fn chat_and_message_caps_are_enforced_inside_write_transactions() {
        let Some(store) = test_store().await else {
            return;
        };
        let session = create_test_session(&store).await;
        let owner = OwnerScope::from_session(&session);
        let limits = ChatStorageLimits {
            max_chats_per_owner: 1,
            max_messages_per_chat: 2,
            max_stored_chars_per_chat: 10,
        };
        let chat = match store
            .create_chat_with_follow_up_limited(
                owner,
                "aiko".to_owned(),
                "aiko_default".to_owned(),
                None,
                limits,
            )
            .await
            .unwrap()
        {
            CreateChatOutcome::Created(chat) => chat,
            outcome => panic!("unexpected first chat outcome: {outcome:?}"),
        };
        assert!(matches!(
            store
                .create_chat_with_follow_up_limited(
                    owner,
                    "aiko".to_owned(),
                    "aiko_default".to_owned(),
                    None,
                    limits,
                )
                .await
                .unwrap(),
            CreateChatOutcome::ChatLimitReached
        ));

        assert!(matches!(
            store
                .append_chat_messages_limited(
                    owner,
                    chat.id,
                    stored_message(AiRole::User, "hey"),
                    stored_message(AiRole::Assistant, "hello"),
                    &[],
                    "UTC",
                    limits,
                )
                .await
                .unwrap(),
            AppendChatMessagesOutcome::Appended { .. }
        ));
        assert!(matches!(
            store
                .append_chat_messages_limited(
                    owner,
                    chat.id,
                    stored_message(AiRole::User, "x"),
                    stored_message(AiRole::Assistant, "y"),
                    &[],
                    "UTC",
                    limits,
                )
                .await
                .unwrap(),
            AppendChatMessagesOutcome::LimitReached
        ));
        let full = store.get_chat(owner, chat.id).await.unwrap().unwrap();
        assert_eq!(full.messages.len(), 2);

        let cleared = store
            .clear_chat_messages(owner, chat.id)
            .await
            .unwrap()
            .expect("full chat should remain clearable");
        assert!(cleared.messages.is_empty());
        let char_limits = ChatStorageLimits {
            max_messages_per_chat: 100,
            max_stored_chars_per_chat: 5,
            ..limits
        };
        assert!(matches!(
            store
                .append_chat_messages_limited(
                    owner,
                    chat.id,
                    stored_message(AiRole::User, "abc"),
                    stored_message(AiRole::Assistant, "def"),
                    &[],
                    "UTC",
                    char_limits,
                )
                .await
                .unwrap(),
            AppendChatMessagesOutcome::LimitReached
        ));
        assert!(store
            .get_chat(owner, chat.id)
            .await
            .unwrap()
            .unwrap()
            .messages
            .is_empty());
        assert!(store.delete_chat(owner, chat.id).await.unwrap());
        cleanup_sessions(&store, &[session.id]).await;
    }

    #[tokio::test]
    async fn persona_summaries_are_limited_and_preview_unicode_scalars_are_truncated() {
        let Some(store) = test_store().await else {
            return;
        };
        let session = create_test_session(&store).await;
        let owner = OwnerScope::from_session(&session);
        let limits = ChatStorageLimits {
            max_chats_per_owner: 51,
            ..ChatStorageLimits::default()
        };
        for _ in 0..50 {
            assert!(matches!(
                store
                    .create_chat_with_follow_up_limited(
                        owner,
                        "aiko".to_owned(),
                        "aiko_default".to_owned(),
                        None,
                        limits,
                    )
                    .await
                    .unwrap(),
                CreateChatOutcome::Created(_)
            ));
        }
        let preview_chat = match store
            .create_chat_with_follow_up_limited(
                owner,
                "aiko".to_owned(),
                "aiko_default".to_owned(),
                None,
                limits,
            )
            .await
            .unwrap()
        {
            CreateChatOutcome::Created(chat) => chat,
            outcome => panic!("unexpected preview chat outcome: {outcome:?}"),
        };
        let long_preview = "🙂".repeat(300);
        store
            .append_chat_messages_limited(
                owner,
                preview_chat.id,
                stored_message(AiRole::User, "preview"),
                stored_message(AiRole::Assistant, &long_preview),
                &[],
                "UTC",
                limits,
            )
            .await
            .unwrap();

        let summaries = store.list_chat_summaries(owner, "aiko").await.unwrap();
        assert_eq!(summaries.len(), 50);
        let preview = summaries
            .iter()
            .find(|summary| summary.id == preview_chat.id)
            .expect("most recently updated chat should be returned");
        assert_eq!(preview.last_message.chars().count(), 256);
        assert_eq!(preview.last_message, "🙂".repeat(256));

        cleanup_sessions(&store, &[session.id]).await;
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
