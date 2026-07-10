use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{PgPool, Postgres, Row, Transaction};
use uuid::Uuid;

use crate::ai::{AiMessage, AiRole};

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

impl ChatStore {
    pub async fn connect(database_url: &str) -> Result<Self, sqlx::Error> {
        let db = PgPool::connect(database_url).await?;
        let store = Self { db: Arc::new(db) };
        store.run_migrations().await?;
        Ok(store)
    }

    pub async fn create_guest_session(&self) -> StoreResult<SessionRecord> {
        let session = SessionRecord {
            id: Uuid::new_v4(),
            user_id: Uuid::new_v4(),
            kind: UserKind::Guest,
            created_at: now_unix_seconds(),
        };

        sqlx::query(
            "insert into auth_sessions (id, user_id, kind, created_at) values ($1, $2, $3, to_timestamp($4))",
        )
        .bind(session.id)
        .bind(session.user_id)
        .bind("guest")
        .bind(session.created_at as i64)
        .execute(self.db.as_ref())
        .await?;

        Ok(session)
    }

    pub async fn promote_session_to_registered(
        &self,
        session_id: Uuid,
        user_id: Uuid,
    ) -> StoreResult<Option<SessionRecord>> {
        let row = sqlx::query(
            "update auth_sessions
             set user_id = $1, kind = 'registered'
             where id = $2
             returning id, user_id, kind, extract(epoch from created_at)::bigint as created_at",
        )
        .bind(user_id)
        .bind(session_id)
        .fetch_optional(self.db.as_ref())
        .await?;

        Ok(row.map(|row| SessionRecord {
            id: row.get("id"),
            user_id: row.get("user_id"),
            kind: parse_user_kind(row.get::<String, _>("kind").as_str()),
            created_at: row.get::<i64, _>("created_at") as u64,
        }))
    }

    #[cfg(test)]
    pub async fn promote_session_to_admin_for_test(
        &self,
        session_id: Uuid,
        user_id: Uuid,
    ) -> StoreResult<Option<SessionRecord>> {
        let row = sqlx::query(
            "update auth_sessions
             set user_id = $1, kind = 'admin'
             where id = $2
             returning id, user_id, kind, extract(epoch from created_at)::bigint as created_at",
        )
        .bind(user_id)
        .bind(session_id)
        .fetch_optional(self.db.as_ref())
        .await?;

        Ok(row.map(|row| SessionRecord {
            id: row.get("id"),
            user_id: row.get("user_id"),
            kind: parse_user_kind(row.get::<String, _>("kind").as_str()),
            created_at: row.get::<i64, _>("created_at") as u64,
        }))
    }

    pub async fn migrate_session_data_to_user(
        &self,
        session_id: Uuid,
        user_id: Uuid,
    ) -> StoreResult<()> {
        let mut tx = self.db.begin().await?;

        let duplicate_memories = sqlx::query(
            "select guest.id as guest_id, account.id as account_id
             from memory_items guest
             join memory_items account
               on account.owner_user_id = $2
              and account.character_id = guest.character_id
              and account.memory_key = guest.memory_key
             where guest.owner_session_id = $1 and guest.owner_user_id is null",
        )
        .bind(session_id)
        .bind(user_id)
        .fetch_all(&mut *tx)
        .await?;

        for row in duplicate_memories {
            let guest_id: Uuid = row.get("guest_id");
            let account_id: Uuid = row.get("account_id");

            sqlx::query(
                "delete from memory_sources guest_source
                 using memory_sources account_source
                 where guest_source.memory_id = $1
                   and account_source.memory_id = $2
                   and (
                     (guest_source.message_id is not null and guest_source.message_id = account_source.message_id)
                     or
                     (guest_source.message_id is null and account_source.message_id is null and guest_source.chat_id = account_source.chat_id)
                   )",
            )
            .bind(guest_id)
            .bind(account_id)
            .execute(&mut *tx)
            .await?;

            sqlx::query("update memory_sources set memory_id = $1 where memory_id = $2")
                .bind(account_id)
                .bind(guest_id)
                .execute(&mut *tx)
                .await?;

            sqlx::query(
                "update memory_items account
                 set
                   kind = case when guest.last_reinforced_at > account.last_reinforced_at then guest.kind else account.kind end,
                   content = case when guest.last_reinforced_at > account.last_reinforced_at then guest.content else account.content end,
                   tags = case when guest.last_reinforced_at > account.last_reinforced_at then guest.tags else account.tags end,
                   confidence = greatest(account.confidence, guest.confidence),
                   importance = greatest(account.importance, guest.importance),
                   last_reinforced_at = greatest(account.last_reinforced_at, guest.last_reinforced_at),
                   expires_at = case when guest.last_reinforced_at > account.last_reinforced_at then guest.expires_at else account.expires_at end,
                   updated_at = now()
                 from memory_items guest
                 where account.id = $1 and guest.id = $2",
            )
            .bind(account_id)
            .bind(guest_id)
            .execute(&mut *tx)
            .await?;

            sqlx::query("delete from memory_items where id = $1")
                .bind(guest_id)
                .execute(&mut *tx)
                .await?;
        }

        sqlx::query(
            "update chats set owner_user_id = $1 where owner_session_id = $2 and owner_user_id is null",
        )
        .bind(user_id)
        .bind(session_id)
        .execute(&mut *tx)
        .await?;

        sqlx::query(
            "update memory_items set owner_user_id = $1 where owner_session_id = $2 and owner_user_id is null",
        )
        .bind(user_id)
        .bind(session_id)
        .execute(&mut *tx)
        .await?;

        sqlx::query(
            "update sync_entities set owner_user_id = $1 where session_id = $2 and owner_user_id is null",
        )
        .bind(user_id)
        .bind(session_id)
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;
        Ok(())
    }

    pub async fn ensure_session(&self, session_id: Option<Uuid>) -> StoreResult<SessionRecord> {
        if let Some(id) = session_id {
            if let Some(session) = self.get_session(id).await? {
                return Ok(session);
            }

            let session = SessionRecord {
                id,
                user_id: Uuid::new_v4(),
                kind: UserKind::Guest,
                created_at: now_unix_seconds(),
            };

            sqlx::query(
                "insert into auth_sessions (id, user_id, kind, created_at) values ($1, $2, $3, to_timestamp($4))",
            )
            .bind(session.id)
            .bind(session.user_id)
            .bind("guest")
            .bind(session.created_at as i64)
            .execute(self.db.as_ref())
            .await?;
            return Ok(session);
        }

        self.create_guest_session().await
    }

    pub async fn get_session(&self, session_id: Uuid) -> StoreResult<Option<SessionRecord>> {
        let row = sqlx::query(
            "select id, user_id, kind, extract(epoch from created_at)::bigint as created_at from auth_sessions where id = $1",
        )
        .bind(session_id)
        .fetch_optional(self.db.as_ref())
        .await?;

        Ok(row.map(|row| SessionRecord {
            id: row.get("id"),
            user_id: row.get("user_id"),
            kind: parse_user_kind(row.get::<String, _>("kind").as_str()),
            created_at: row.get::<i64, _>("created_at") as u64,
        }))
    }

    pub async fn upsert_auth_identity(
        &self,
        user_id: Uuid,
        provider: &str,
        provider_subject: &str,
        email: Option<String>,
        provider_name: Option<String>,
        provider_avatar_url: Option<String>,
    ) -> StoreResult<AuthIdentityRecord> {
        let row = sqlx::query(
            "insert into auth_identities (user_id, provider, provider_subject, email, provider_name, provider_avatar_url, updated_at)
             values ($1, $2, $3, $4, $5, $6, now())
             on conflict (provider, provider_subject)
             do update set
               user_id = excluded.user_id,
               email = excluded.email,
               provider_name = excluded.provider_name,
               provider_avatar_url = excluded.provider_avatar_url,
               updated_at = now()
             returning user_id, provider, provider_subject, email, provider_name, provider_avatar_url",
        )
        .bind(user_id)
        .bind(provider)
        .bind(provider_subject)
        .bind(email)
        .bind(provider_name)
        .bind(provider_avatar_url)
        .fetch_one(self.db.as_ref())
        .await?;

        Ok(AuthIdentityRecord {
            user_id: row.get("user_id"),
            provider: row.get("provider"),
            provider_subject: row.get("provider_subject"),
            email: row.get("email"),
            provider_name: row.get("provider_name"),
            provider_avatar_url: row.get("provider_avatar_url"),
        })
    }

    pub async fn get_auth_identity(
        &self,
        user_id: Uuid,
    ) -> StoreResult<Option<AuthIdentityRecord>> {
        let row = sqlx::query(
            "select user_id, provider, provider_subject, email, provider_name, provider_avatar_url
             from auth_identities
             where user_id = $1
             order by updated_at desc
             limit 1",
        )
        .bind(user_id)
        .fetch_optional(self.db.as_ref())
        .await?;

        Ok(row.map(|row| AuthIdentityRecord {
            user_id: row.get("user_id"),
            provider: row.get("provider"),
            provider_subject: row.get("provider_subject"),
            email: row.get("email"),
            provider_name: row.get("provider_name"),
            provider_avatar_url: row.get("provider_avatar_url"),
        }))
    }

    pub async fn ensure_user_profile(
        &self,
        user_id: Uuid,
        display_name: Option<String>,
        avatar_url: Option<String>,
    ) -> StoreResult<Option<UserProfileRecord>> {
        let seed_display_name =
            non_empty_string(display_name).unwrap_or_else(|| "Member".to_owned());
        let seed_avatar_url = non_empty_string(avatar_url);
        sqlx::query(
            "insert into user_profiles (user_id, display_name, avatar_url, created_at, updated_at)
             values ($1, $2, $3, now(), now())
             on conflict (user_id) do nothing",
        )
        .bind(user_id)
        .bind(seed_display_name)
        .bind(seed_avatar_url)
        .execute(self.db.as_ref())
        .await?;

        self.get_user_profile(user_id).await
    }

    pub async fn get_user_profile(&self, user_id: Uuid) -> StoreResult<Option<UserProfileRecord>> {
        let row = sqlx::query(
            "select user_id, display_name, avatar_url from user_profiles where user_id = $1",
        )
        .bind(user_id)
        .fetch_optional(self.db.as_ref())
        .await?;

        Ok(row.map(|row| UserProfileRecord {
            user_id: row.get("user_id"),
            display_name: row.get("display_name"),
            avatar_url: row.get("avatar_url"),
        }))
    }

    pub async fn update_user_profile(
        &self,
        user_id: Uuid,
        display_name: Option<String>,
        avatar_url: Option<String>,
    ) -> StoreResult<Option<UserProfileRecord>> {
        let Some(current) = self.get_user_profile(user_id).await? else {
            return Ok(None);
        };
        let next_display_name = non_empty_string(display_name).unwrap_or(current.display_name);
        let next_avatar_url = avatar_url
            .map(|value| value.trim().to_owned())
            .and_then(|value| if value.is_empty() { None } else { Some(value) });
        let row = sqlx::query(
            "update user_profiles
             set display_name = $1, avatar_url = $2, updated_at = now()
             where user_id = $3
             returning user_id, display_name, avatar_url",
        )
        .bind(next_display_name)
        .bind(next_avatar_url.or(current.avatar_url))
        .bind(user_id)
        .fetch_optional(self.db.as_ref())
        .await?;

        Ok(row.map(|row| UserProfileRecord {
            user_id: row.get("user_id"),
            display_name: row.get("display_name"),
            avatar_url: row.get("avatar_url"),
        }))
    }

    pub async fn list_chats(&self, owner: OwnerScope) -> StoreResult<Vec<ChatRecord>> {
        let rows = sqlx::query(
            "select id, owner_session_id, character_id, ai_profile_id, extract(epoch from created_at)::bigint as created_at, extract(epoch from updated_at)::bigint as updated_at
             from chats
             where (($2::uuid is not null and owner_user_id = $2) or ($2::uuid is null and owner_session_id = $1))
             order by updated_at desc",
        )
        .bind(owner.session_id)
        .bind(owner.user_id)
        .fetch_all(self.db.as_ref())
        .await?;

        let mut chats = Vec::with_capacity(rows.len());
        for row in rows {
            let chat_id: Uuid = row.get("id");
            chats.push(ChatRecord {
                id: chat_id,
                owner_session_id: row.get("owner_session_id"),
                character_id: row.get("character_id"),
                ai_profile_id: row.get("ai_profile_id"),
                messages: self.messages_for_chat(chat_id).await?,
                created_at: row.get::<i64, _>("created_at") as u64,
                updated_at: row.get::<i64, _>("updated_at") as u64,
            });
        }
        Ok(chats)
    }

    pub async fn create_chat(
        &self,
        owner: OwnerScope,
        character_id: String,
        ai_profile_id: String,
    ) -> StoreResult<ChatRecord> {
        let id = Uuid::new_v4();
        let now = now_unix_seconds() as i64;
        sqlx::query(
            "insert into chats (id, owner_session_id, owner_user_id, character_id, ai_profile_id, created_at, updated_at) values ($1, $2, $3, $4, $5, to_timestamp($6), to_timestamp($6))",
        )
        .bind(id)
        .bind(owner.session_id)
        .bind(owner.user_id)
        .bind(&character_id)
        .bind(&ai_profile_id)
        .bind(now)
        .execute(self.db.as_ref())
        .await?;

        Ok(ChatRecord {
            id,
            owner_session_id: owner.session_id,
            character_id,
            ai_profile_id,
            messages: Vec::new(),
            created_at: now as u64,
            updated_at: now as u64,
        })
    }

    pub async fn get_chat(
        &self,
        owner: OwnerScope,
        chat_id: Uuid,
    ) -> StoreResult<Option<ChatRecord>> {
        let row = sqlx::query(
            "select id, owner_session_id, character_id, ai_profile_id, extract(epoch from created_at)::bigint as created_at, extract(epoch from updated_at)::bigint as updated_at
             from chats
             where id = $1 and (($3::uuid is not null and owner_user_id = $3) or ($3::uuid is null and owner_session_id = $2))",
        )
        .bind(chat_id)
        .bind(owner.session_id)
        .bind(owner.user_id)
        .fetch_optional(self.db.as_ref())
        .await?;

        let Some(row) = row else {
            return Ok(None);
        };

        Ok(Some(ChatRecord {
            id: row.get("id"),
            owner_session_id: row.get("owner_session_id"),
            character_id: row.get("character_id"),
            ai_profile_id: row.get("ai_profile_id"),
            messages: self.messages_for_chat(chat_id).await?,
            created_at: row.get::<i64, _>("created_at") as u64,
            updated_at: row.get::<i64, _>("updated_at") as u64,
        }))
    }

    pub async fn append_chat_messages(
        &self,
        owner: OwnerScope,
        chat_id: Uuid,
        user_message: StoredMessage,
        assistant_message: StoredMessage,
    ) -> StoreResult<Option<ChatRecord>> {
        self.append_chat_messages_with_attachments(
            owner,
            chat_id,
            user_message,
            assistant_message,
            &[],
        )
        .await
    }

    pub async fn append_chat_messages_with_attachments(
        &self,
        owner: OwnerScope,
        chat_id: Uuid,
        user_message: StoredMessage,
        assistant_message: StoredMessage,
        attachment_ids: &[Uuid],
    ) -> StoreResult<Option<ChatRecord>> {
        let mut tx = self.db.begin().await?;
        let owner_exists = sqlx::query(
            "select id from chats where id = $1 and (($3::uuid is not null and owner_user_id = $3) or ($3::uuid is null and owner_session_id = $2)) for update",
        )
            .bind(chat_id)
            .bind(owner.session_id)
            .bind(owner.user_id)
            .fetch_optional(&mut *tx)
            .await?
            .is_some();
        if !owner_exists {
            return Ok(None);
        }

        sqlx::query(
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
        .execute(&mut *tx)
        .await?;

        if !attachment_ids.is_empty() {
            let result = sqlx::query(
                "update chat_attachments
                 set chat_id = $1, message_id = $2
                 where id = any($3)
                   and chat_id is null
                   and message_id is null
                   and deleted_at is null
                   and (($5::uuid is not null and owner_user_id = $5) or ($5::uuid is null and owner_session_id = $4))",
            )
            .bind(chat_id)
            .bind(user_message.id)
            .bind(attachment_ids)
            .bind(owner.session_id)
            .bind(owner.user_id)
            .execute(&mut *tx)
            .await?;
            let updated_count = result.rows_affected();
            if updated_count != attachment_ids.len() as u64 {
                let _ = tx.rollback().await;
                return Ok(None);
            }
        }

        sqlx::query("update chats set updated_at = now() where id = $1")
            .bind(chat_id)
            .execute(&mut *tx)
            .await?;

        tx.commit().await?;

        self.get_chat(owner, chat_id).await
    }

    pub async fn clear_chat_messages(
        &self,
        owner: OwnerScope,
        chat_id: Uuid,
    ) -> StoreResult<Option<ChatRecord>> {
        let mut tx = self.db.begin().await?;
        let owner_exists = sqlx::query(
            "select id from chats where id = $1 and (($3::uuid is not null and owner_user_id = $3) or ($3::uuid is null and owner_session_id = $2)) for update",
        )
        .bind(chat_id)
        .bind(owner.session_id)
        .bind(owner.user_id)
        .fetch_optional(&mut *tx)
        .await?
        .is_some();
        if !owner_exists {
            return Ok(None);
        }

        let affected_memory_ids = sqlx::query(
            "select distinct memory_id
             from memory_sources
             where chat_id = $1 and message_id is not null",
        )
        .bind(chat_id)
        .fetch_all(&mut *tx)
        .await?
        .into_iter()
        .map(|row| row.get::<Uuid, _>("memory_id"))
        .collect::<Vec<_>>();

        sqlx::query("delete from chat_messages where chat_id = $1")
            .bind(chat_id)
            .execute(&mut *tx)
            .await?;
        cleanup_memory_after_source_removal(&mut tx, &affected_memory_ids).await?;
        sqlx::query("update chats set updated_at = now() where id = $1")
            .bind(chat_id)
            .execute(&mut *tx)
            .await?;

        tx.commit().await?;
        self.get_chat(owner, chat_id).await
    }

    pub async fn delete_chat(&self, owner: OwnerScope, chat_id: Uuid) -> StoreResult<bool> {
        let mut tx = self.db.begin().await?;
        let owner_exists = sqlx::query(
            "select id from chats where id = $1 and (($3::uuid is not null and owner_user_id = $3) or ($3::uuid is null and owner_session_id = $2)) for update",
        )
        .bind(chat_id)
        .bind(owner.session_id)
        .bind(owner.user_id)
        .fetch_optional(&mut *tx)
        .await?
        .is_some();
        if !owner_exists {
            return Ok(false);
        }

        let affected_memory_ids =
            sqlx::query("select distinct memory_id from memory_sources where chat_id = $1")
                .bind(chat_id)
                .fetch_all(&mut *tx)
                .await?
                .into_iter()
                .map(|row| row.get::<Uuid, _>("memory_id"))
                .collect::<Vec<_>>();

        let result = sqlx::query(
            "delete from chats where id = $1 and (($3::uuid is not null and owner_user_id = $3) or ($3::uuid is null and owner_session_id = $2))",
        )
        .bind(chat_id)
        .bind(owner.session_id)
        .bind(owner.user_id)
        .execute(&mut *tx)
        .await?;

        cleanup_memory_after_source_removal(&mut tx, &affected_memory_ids).await?;

        tx.commit().await?;
        Ok(result.rows_affected() > 0)
    }

    pub async fn upsert_memory_item(
        &self,
        owner: OwnerScope,
        item: NewMemoryItemRecord,
    ) -> StoreResult<MemoryItemRecord> {
        let id = Uuid::new_v4();
        let query = if owner.user_id.is_some() {
            "insert into memory_items (
                id, owner_session_id, owner_user_id, character_id, memory_key, kind, content,
                tags, confidence, importance, last_reinforced_at, expires_at
             ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, to_timestamp($11),
                case when $12::bigint is null then null else to_timestamp($12) end)
             on conflict (owner_user_id, character_id, memory_key) where owner_user_id is not null
             do update set
                kind = excluded.kind,
                content = excluded.content,
                tags = excluded.tags,
                confidence = excluded.confidence,
                importance = excluded.importance,
                last_reinforced_at = greatest(memory_items.last_reinforced_at, excluded.last_reinforced_at),
                expires_at = excluded.expires_at,
                updated_at = now()
             returning id, owner_session_id, owner_user_id, character_id, memory_key, kind, content,
                tags, confidence, importance,
                extract(epoch from last_reinforced_at)::bigint as last_reinforced_at,
                extract(epoch from expires_at)::bigint as expires_at,
                extract(epoch from created_at)::bigint as created_at,
                extract(epoch from updated_at)::bigint as updated_at"
        } else {
            "insert into memory_items (
                id, owner_session_id, owner_user_id, character_id, memory_key, kind, content,
                tags, confidence, importance, last_reinforced_at, expires_at
             ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, to_timestamp($11),
                case when $12::bigint is null then null else to_timestamp($12) end)
             on conflict (owner_session_id, character_id, memory_key) where owner_user_id is null
             do update set
                kind = excluded.kind,
                content = excluded.content,
                tags = excluded.tags,
                confidence = excluded.confidence,
                importance = excluded.importance,
                last_reinforced_at = greatest(memory_items.last_reinforced_at, excluded.last_reinforced_at),
                expires_at = excluded.expires_at,
                updated_at = now()
             returning id, owner_session_id, owner_user_id, character_id, memory_key, kind, content,
                tags, confidence, importance,
                extract(epoch from last_reinforced_at)::bigint as last_reinforced_at,
                extract(epoch from expires_at)::bigint as expires_at,
                extract(epoch from created_at)::bigint as created_at,
                extract(epoch from updated_at)::bigint as updated_at"
        };

        let row = sqlx::query(query)
            .bind(id)
            .bind(owner.session_id)
            .bind(owner.user_id)
            .bind(item.character_id)
            .bind(item.memory_key)
            .bind(item.kind)
            .bind(item.content)
            .bind(item.tags)
            .bind(item.confidence as f64)
            .bind(item.importance as f64)
            .bind(item.last_reinforced_at as i64)
            .bind(item.expires_at.map(|value| value as i64))
            .fetch_one(self.db.as_ref())
            .await?;

        Ok(memory_item_from_row(row))
    }

    pub async fn list_memory_items(
        &self,
        owner: OwnerScope,
        character_id: &str,
    ) -> StoreResult<Vec<MemoryItemRecord>> {
        let rows = sqlx::query(
            "select id, owner_session_id, owner_user_id, character_id, memory_key, kind, content,
                tags, confidence, importance,
                extract(epoch from last_reinforced_at)::bigint as last_reinforced_at,
                extract(epoch from expires_at)::bigint as expires_at,
                extract(epoch from created_at)::bigint as created_at,
                extract(epoch from updated_at)::bigint as updated_at
             from memory_items
             where (($3::uuid is not null and owner_user_id = $3) or ($3::uuid is null and owner_session_id = $1))
               and character_id = $2
             order by last_reinforced_at desc, id",
        )
        .bind(owner.session_id)
        .bind(character_id)
        .bind(owner.user_id)
        .fetch_all(self.db.as_ref())
        .await?;

        Ok(rows.into_iter().map(memory_item_from_row).collect())
    }

    pub async fn add_memory_source(
        &self,
        owner: OwnerScope,
        memory_id: Uuid,
        chat_id: Uuid,
        message_id: Option<Uuid>,
        evidence_strength: f32,
    ) -> StoreResult<Option<MemorySourceRecord>> {
        let mut tx = self.db.begin().await?;
        let valid_source = sqlx::query(
            "select item.id
             from memory_items item
             join chats chat on chat.id = $2 and chat.character_id = item.character_id
             where item.id = $1
               and (($4::uuid is not null and item.owner_user_id = $4) or ($4::uuid is null and item.owner_session_id = $3))
               and (($4::uuid is not null and chat.owner_user_id = $4) or ($4::uuid is null and chat.owner_session_id = $3))
               and ($5::uuid is null or exists (
                 select 1 from chat_messages message where message.id = $5 and message.chat_id = chat.id
               ))",
        )
        .bind(memory_id)
        .bind(chat_id)
        .bind(owner.session_id)
        .bind(owner.user_id)
        .bind(message_id)
        .fetch_optional(&mut *tx)
        .await?
        .is_some();
        if !valid_source {
            return Ok(None);
        }

        let source_id = Uuid::new_v4();
        let query = if message_id.is_some() {
            "insert into memory_sources (id, memory_id, chat_id, message_id, evidence_strength)
             values ($1, $2, $3, $4, $5)
             on conflict (memory_id, message_id) where message_id is not null
             do update set evidence_strength = excluded.evidence_strength
             returning id, memory_id, chat_id, message_id, evidence_strength,
                extract(epoch from created_at)::bigint as created_at"
        } else {
            "insert into memory_sources (id, memory_id, chat_id, message_id, evidence_strength)
             values ($1, $2, $3, $4, $5)
             on conflict (memory_id, chat_id) where message_id is null
             do update set evidence_strength = excluded.evidence_strength
             returning id, memory_id, chat_id, message_id, evidence_strength,
                extract(epoch from created_at)::bigint as created_at"
        };
        let row = sqlx::query(query)
            .bind(source_id)
            .bind(memory_id)
            .bind(chat_id)
            .bind(message_id)
            .bind(evidence_strength as f64)
            .fetch_one(&mut *tx)
            .await?;

        sqlx::query(
            "update memory_items
             set
               confidence = evidence.max_strength,
               last_reinforced_at = evidence.last_reinforced_at,
               updated_at = now()
             from (
               select max(evidence_strength) as max_strength, max(created_at) as last_reinforced_at
               from memory_sources
               where memory_id = $1
             ) evidence
             where id = $1",
        )
        .bind(memory_id)
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;
        Ok(Some(memory_source_from_row(row)))
    }

    pub async fn list_memory_sources(
        &self,
        owner: OwnerScope,
        memory_id: Uuid,
    ) -> StoreResult<Vec<MemorySourceRecord>> {
        let rows = sqlx::query(
            "select source.id, source.memory_id, source.chat_id, source.message_id,
                source.evidence_strength, extract(epoch from source.created_at)::bigint as created_at
             from memory_sources source
             join memory_items item on item.id = source.memory_id
             where source.memory_id = $1
               and (($3::uuid is not null and item.owner_user_id = $3) or ($3::uuid is null and item.owner_session_id = $2))
             order by source.created_at, source.id",
        )
        .bind(memory_id)
        .bind(owner.session_id)
        .bind(owner.user_id)
        .fetch_all(self.db.as_ref())
        .await?;

        Ok(rows.into_iter().map(memory_source_from_row).collect())
    }

    pub async fn reset_learned_context(&self, owner: OwnerScope) -> StoreResult<u64> {
        let result = sqlx::query(
            "delete from memory_items
             where (($2::uuid is not null and owner_user_id = $2) or ($2::uuid is null and owner_session_id = $1))",
        )
        .bind(owner.session_id)
        .bind(owner.user_id)
        .execute(self.db.as_ref())
        .await?;

        Ok(result.rows_affected())
    }

    pub async fn create_chat_attachment(
        &self,
        owner: OwnerScope,
        attachment: NewChatAttachmentRecord,
    ) -> StoreResult<ChatAttachmentRecord> {
        let row = sqlx::query(
            "insert into chat_attachments (
                id,
                owner_session_id,
                owner_user_id,
                kind,
                mime_type,
                byte_size,
                width,
                height,
                sha256,
                storage_key
             )
             values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             returning
                id,
                owner_session_id,
                owner_user_id,
                chat_id,
                message_id,
                kind,
                mime_type,
                byte_size,
                width,
                height,
                sha256,
                storage_key,
                extract(epoch from created_at)::bigint as created_at,
                extract(epoch from deleted_at)::bigint as deleted_at",
        )
        .bind(attachment.id)
        .bind(owner.session_id)
        .bind(owner.user_id)
        .bind(attachment.kind)
        .bind(attachment.mime_type)
        .bind(attachment.byte_size)
        .bind(attachment.width)
        .bind(attachment.height)
        .bind(attachment.sha256)
        .bind(attachment.storage_key)
        .fetch_one(self.db.as_ref())
        .await?;

        Ok(chat_attachment_from_row(row))
    }

    pub async fn link_chat_attachments_to_message(
        &self,
        owner: OwnerScope,
        chat_id: Uuid,
        message_id: Uuid,
        attachment_ids: &[Uuid],
    ) -> StoreResult<u64> {
        if attachment_ids.is_empty() {
            return Ok(0);
        }

        let result = sqlx::query(
            "update chat_attachments
             set chat_id = $1, message_id = $2
             where id = any($3)
               and chat_id is null
               and message_id is null
               and deleted_at is null
               and (($5::uuid is not null and owner_user_id = $5) or ($5::uuid is null and owner_session_id = $4))",
        )
        .bind(chat_id)
        .bind(message_id)
        .bind(attachment_ids)
        .bind(owner.session_id)
        .bind(owner.user_id)
        .execute(self.db.as_ref())
        .await?;

        Ok(result.rows_affected())
    }

    pub async fn get_chat_attachment(
        &self,
        owner: OwnerScope,
        attachment_id: Uuid,
    ) -> StoreResult<Option<ChatAttachmentRecord>> {
        let row = sqlx::query(
            "select
                id,
                owner_session_id,
                owner_user_id,
                chat_id,
                message_id,
                kind,
                mime_type,
                byte_size,
                width,
                height,
                sha256,
                storage_key,
                extract(epoch from created_at)::bigint as created_at,
                extract(epoch from deleted_at)::bigint as deleted_at
             from chat_attachments
             where id = $1
               and deleted_at is null
               and (($3::uuid is not null and owner_user_id = $3) or ($3::uuid is null and owner_session_id = $2))",
        )
        .bind(attachment_id)
        .bind(owner.session_id)
        .bind(owner.user_id)
        .fetch_optional(self.db.as_ref())
        .await?;

        Ok(row.map(chat_attachment_from_row))
    }

    pub async fn mark_pending_chat_attachment_deleted(
        &self,
        owner: OwnerScope,
        attachment_id: Uuid,
    ) -> StoreResult<Option<ChatAttachmentRecord>> {
        let row = sqlx::query(
            "update chat_attachments
             set deleted_at = now()
             where id = $1
               and message_id is null
               and deleted_at is null
               and (($3::uuid is not null and owner_user_id = $3) or ($3::uuid is null and owner_session_id = $2))
             returning
                id,
                owner_session_id,
                owner_user_id,
                chat_id,
                message_id,
                kind,
                mime_type,
                byte_size,
                width,
                height,
                sha256,
                storage_key,
                extract(epoch from created_at)::bigint as created_at,
                extract(epoch from deleted_at)::bigint as deleted_at",
        )
        .bind(attachment_id)
        .bind(owner.session_id)
        .bind(owner.user_id)
        .fetch_optional(self.db.as_ref())
        .await?;

        Ok(row.map(chat_attachment_from_row))
    }

    pub async fn mark_stale_pending_chat_attachments_deleted(
        &self,
        kind: &str,
        stale_before_unix_seconds: u64,
        limit: i64,
    ) -> StoreResult<Vec<ChatAttachmentRecord>> {
        if limit <= 0 {
            return Ok(Vec::new());
        }

        let rows = sqlx::query(
            "update chat_attachments
             set deleted_at = now()
             where id in (
                select id
                from chat_attachments
                where kind = $1
                  and chat_id is null
                  and message_id is null
                  and deleted_at is null
                  and created_at < to_timestamp($2)
                order by created_at asc
                limit $3
             )
             returning
                id,
                owner_session_id,
                owner_user_id,
                chat_id,
                message_id,
                kind,
                mime_type,
                byte_size,
                width,
                height,
                sha256,
                storage_key,
                extract(epoch from created_at)::bigint as created_at,
                extract(epoch from deleted_at)::bigint as deleted_at",
        )
        .bind(kind)
        .bind(stale_before_unix_seconds as i64)
        .bind(limit)
        .fetch_all(self.db.as_ref())
        .await?;

        Ok(rows.into_iter().map(chat_attachment_from_row).collect())
    }

    #[cfg(test)]
    pub async fn set_chat_attachment_created_at_for_test(
        &self,
        attachment_id: Uuid,
        created_at: u64,
    ) -> StoreResult<Option<ChatAttachmentRecord>> {
        let row = sqlx::query(
            "update chat_attachments
             set created_at = to_timestamp($2)
             where id = $1
             returning
                id,
                owner_session_id,
                owner_user_id,
                chat_id,
                message_id,
                kind,
                mime_type,
                byte_size,
                width,
                height,
                sha256,
                storage_key,
                extract(epoch from created_at)::bigint as created_at,
                extract(epoch from deleted_at)::bigint as deleted_at",
        )
        .bind(attachment_id)
        .bind(created_at as i64)
        .fetch_optional(self.db.as_ref())
        .await?;

        Ok(row.map(chat_attachment_from_row))
    }

    pub async fn count_sync_entities(&self, owner: OwnerScope) -> StoreResult<u32> {
        let entities_count: i64 = sqlx::query_scalar(
            "select count(*) from sync_entities where (($2::uuid is not null and owner_user_id = $2) or ($2::uuid is null and session_id = $1))",
        )
        .bind(owner.session_id)
        .bind(owner.user_id)
        .fetch_one(self.db.as_ref())
        .await?;
        Ok(entities_count.max(0) as u32)
    }

    pub async fn upsert_sync_entity(&self, entity: &SyncEntityRecord) -> StoreResult<bool> {
        let deleted_at = entity.deleted_at.map(|value| value as i64);
        if let Some(owner_user_id) = entity.owner_user_id {
            let updated = sqlx::query(
                "update sync_entities
                 set item_type = $3,
                     updated_at = to_timestamp($4),
                     deleted_at = to_timestamp($5),
                     payload = $6
                 where owner_user_id = $1 and item_id = $2 and updated_at <= to_timestamp($4)",
            )
            .bind(owner_user_id)
            .bind(&entity.item_id)
            .bind(&entity.item_type)
            .bind(entity.updated_at as i64)
            .bind(deleted_at)
            .bind(&entity.payload)
            .execute(self.db.as_ref())
            .await?
            .rows_affected()
                > 0;
            if updated {
                return Ok(true);
            }

            let exists = sqlx::query_scalar::<_, i64>(
                "select count(*) from sync_entities where owner_user_id = $1 and item_id = $2",
            )
            .bind(owner_user_id)
            .bind(&entity.item_id)
            .fetch_one(self.db.as_ref())
            .await?
                > 0;
            if exists {
                return Ok(false);
            }

            sqlx::query(
                "insert into sync_entities (session_id, owner_user_id, item_id, item_type, updated_at, deleted_at, payload)
                 values ($1, $2, $3, $4, to_timestamp($5), to_timestamp($6), $7)",
            )
            .bind(entity.session_id)
            .bind(owner_user_id)
            .bind(&entity.item_id)
            .bind(&entity.item_type)
            .bind(entity.updated_at as i64)
            .bind(deleted_at)
            .bind(&entity.payload)
            .execute(self.db.as_ref())
            .await?;
            return Ok(true);
        }

        let result = sqlx::query(
            "insert into sync_entities (session_id, owner_user_id, item_id, item_type, updated_at, deleted_at, payload)
             values ($1, null, $2, $3, to_timestamp($4), to_timestamp($5), $6)
             on conflict (session_id, item_id)
             do update set
               owner_user_id = excluded.owner_user_id,
               item_type = excluded.item_type,
               updated_at = excluded.updated_at,
               deleted_at = excluded.deleted_at,
               payload = excluded.payload
             where sync_entities.updated_at <= excluded.updated_at",
        )
        .bind(entity.session_id)
        .bind(&entity.item_id)
        .bind(&entity.item_type)
        .bind(entity.updated_at as i64)
        .bind(deleted_at)
        .bind(&entity.payload)
        .execute(self.db.as_ref())
        .await?;
        Ok(result.rows_affected() > 0)
    }

    pub async fn get_sync_entity_updated_at(
        &self,
        owner: OwnerScope,
        item_id: &str,
    ) -> StoreResult<Option<u64>> {
        let value: Option<i64> = sqlx::query_scalar(
            "select max(extract(epoch from updated_at)::bigint)
             from sync_entities
             where (($3::uuid is not null and owner_user_id = $3) or ($3::uuid is null and session_id = $1)) and item_id = $2",
        )
        .bind(owner.session_id)
        .bind(item_id)
        .bind(owner.user_id)
        .fetch_one(self.db.as_ref())
        .await?;

        Ok(value.map(|item| item as u64))
    }

    pub async fn list_sync_entities_since(
        &self,
        owner: OwnerScope,
        cursor: u64,
        limit: u32,
    ) -> StoreResult<Vec<SyncEntityRecord>> {
        let rows = sqlx::query(
            "select session_id, owner_user_id, item_id, item_type,
                    extract(epoch from updated_at)::bigint as updated_at,
                    extract(epoch from deleted_at)::bigint as deleted_at,
                    payload
             from (
                 select distinct on (item_id) session_id, owner_user_id, item_id, item_type, updated_at, deleted_at, payload
                 from sync_entities
                 where (($4::uuid is not null and owner_user_id = $4) or ($4::uuid is null and session_id = $1))
                   and extract(epoch from updated_at)::bigint > $2
                 order by item_id, updated_at desc
             ) latest
             order by updated_at asc
             limit $3",
        )
        .bind(owner.session_id)
        .bind(cursor as i64)
        .bind(limit as i64)
        .bind(owner.user_id)
        .fetch_all(self.db.as_ref())
        .await?;

        Ok(rows
            .into_iter()
            .map(|row| SyncEntityRecord {
                session_id: row.get("session_id"),
                owner_user_id: row.get("owner_user_id"),
                item_id: row.get("item_id"),
                item_type: row.get("item_type"),
                updated_at: row.get::<i64, _>("updated_at") as u64,
                deleted_at: row
                    .get::<Option<i64>, _>("deleted_at")
                    .map(|value| value as u64),
                payload: row.get("payload"),
            })
            .collect())
    }

    pub async fn get_sync_commit(
        &self,
        session_id: Uuid,
        operation_id: &str,
    ) -> StoreResult<Option<SyncCommitRecord>> {
        let row = sqlx::query(
            "select operation_id, session_id, user_id, merged_count, conflict_count, extract(epoch from committed_at)::bigint as committed_at
             from sync_commits
             where session_id = $1 and operation_id = $2",
        )
        .bind(session_id)
        .bind(operation_id)
        .fetch_optional(self.db.as_ref())
        .await?;

        Ok(row.map(|row| SyncCommitRecord {
            operation_id: row.get("operation_id"),
            session_id: row.get("session_id"),
            user_id: row.get("user_id"),
            merged_count: row.get::<i32, _>("merged_count") as u32,
            conflict_count: row.get::<i32, _>("conflict_count") as u32,
            committed_at: row.get::<i64, _>("committed_at") as u64,
        }))
    }

    pub async fn save_sync_commit(
        &self,
        session_id: Uuid,
        user_id: Uuid,
        operation_id: &str,
        merged_count: u32,
        conflict_count: u32,
    ) -> StoreResult<SyncCommitRecord> {
        if let Some(existing) = self.get_sync_commit(session_id, operation_id).await? {
            return Ok(existing);
        }

        let row = sqlx::query(
            "insert into sync_commits (operation_id, session_id, user_id, merged_count, conflict_count)
             values ($1, $2, $3, $4, $5)
             on conflict (operation_id, session_id) do nothing
             returning extract(epoch from committed_at)::bigint as committed_at",
        )
        .bind(operation_id)
        .bind(session_id)
        .bind(user_id)
        .bind(merged_count as i32)
        .bind(conflict_count as i32)
        .fetch_optional(self.db.as_ref())
        .await?;

        let Some(row) = row else {
            return self
                .get_sync_commit(session_id, operation_id)
                .await?
                .ok_or(sqlx::Error::RowNotFound);
        };

        Ok(SyncCommitRecord {
            operation_id: operation_id.to_owned(),
            session_id,
            user_id,
            merged_count,
            conflict_count,
            committed_at: row.get::<i64, _>("committed_at") as u64,
        })
    }

    async fn messages_for_chat(&self, chat_id: Uuid) -> StoreResult<Vec<StoredMessage>> {
        let rows = sqlx::query(
            "select id, role, content, extract(epoch from created_at)::bigint as created_at from chat_messages where chat_id = $1 order by sort_order asc",
        )
        .bind(chat_id)
        .fetch_all(self.db.as_ref())
        .await?;

        let mut messages = Vec::with_capacity(rows.len());
        for row in rows {
            let role_value: String = row.get("role");
            let Some(role) = role_from_db(&role_value) else {
                continue;
            };
            let message_id: Uuid = row.get("id");
            messages.push(StoredMessage {
                id: message_id,
                role,
                content: row.get("content"),
                attachments: self.attachments_for_message(message_id).await?,
                created_at: row.get::<i64, _>("created_at") as u64,
            });
        }

        Ok(messages)
    }

    async fn attachments_for_message(
        &self,
        message_id: Uuid,
    ) -> StoreResult<Vec<ChatAttachmentRecord>> {
        let rows = sqlx::query(
            "select
                id,
                owner_session_id,
                owner_user_id,
                chat_id,
                message_id,
                kind,
                mime_type,
                byte_size,
                width,
                height,
                sha256,
                storage_key,
                extract(epoch from created_at)::bigint as created_at,
                extract(epoch from deleted_at)::bigint as deleted_at
             from chat_attachments
             where message_id = $1 and deleted_at is null
             order by created_at asc",
        )
        .bind(message_id)
        .fetch_all(self.db.as_ref())
        .await?;

        Ok(rows.into_iter().map(chat_attachment_from_row).collect())
    }

    async fn run_migrations(&self) -> Result<(), sqlx::Error> {
        sqlx::migrate!("./migrations").run(self.db.as_ref()).await?;
        Ok(())
    }
}

async fn cleanup_memory_after_source_removal(
    tx: &mut Transaction<'_, Postgres>,
    affected_memory_ids: &[Uuid],
) -> StoreResult<()> {
    if affected_memory_ids.is_empty() {
        return Ok(());
    }

    sqlx::query(
        "delete from memory_items item
         where item.id = any($1)
           and not exists (select 1 from memory_sources source where source.memory_id = item.id)",
    )
    .bind(affected_memory_ids)
    .execute(&mut **tx)
    .await?;

    sqlx::query(
        "update memory_items item
         set
           confidence = evidence.max_strength,
           last_reinforced_at = evidence.last_reinforced_at,
           updated_at = now()
         from (
           select memory_id, max(evidence_strength) as max_strength, max(created_at) as last_reinforced_at
           from memory_sources
           where memory_id = any($1)
           group by memory_id
         ) evidence
         where item.id = evidence.memory_id",
    )
    .bind(affected_memory_ids)
    .execute(&mut **tx)
    .await?;

    Ok(())
}

fn memory_item_from_row(row: sqlx::postgres::PgRow) -> MemoryItemRecord {
    MemoryItemRecord {
        id: row.get("id"),
        owner_session_id: row.get("owner_session_id"),
        owner_user_id: row.get("owner_user_id"),
        character_id: row.get("character_id"),
        memory_key: row.get("memory_key"),
        kind: row.get("kind"),
        content: row.get("content"),
        tags: row.get("tags"),
        confidence: row.get::<f64, _>("confidence") as f32,
        importance: row.get::<f64, _>("importance") as f32,
        last_reinforced_at: row.get::<i64, _>("last_reinforced_at") as u64,
        expires_at: row
            .get::<Option<i64>, _>("expires_at")
            .map(|value| value as u64),
        created_at: row.get::<i64, _>("created_at") as u64,
        updated_at: row.get::<i64, _>("updated_at") as u64,
    }
}

fn memory_source_from_row(row: sqlx::postgres::PgRow) -> MemorySourceRecord {
    MemorySourceRecord {
        id: row.get("id"),
        memory_id: row.get("memory_id"),
        chat_id: row.get("chat_id"),
        message_id: row.get("message_id"),
        evidence_strength: row.get::<f64, _>("evidence_strength") as f32,
        created_at: row.get::<i64, _>("created_at") as u64,
    }
}

fn chat_attachment_from_row(row: sqlx::postgres::PgRow) -> ChatAttachmentRecord {
    ChatAttachmentRecord {
        id: row.get("id"),
        owner_session_id: row.get("owner_session_id"),
        owner_user_id: row.get("owner_user_id"),
        chat_id: row.get("chat_id"),
        message_id: row.get("message_id"),
        kind: row.get("kind"),
        mime_type: row.get("mime_type"),
        byte_size: row.get("byte_size"),
        width: row.get("width"),
        height: row.get("height"),
        sha256: row.get("sha256"),
        storage_key: row.get("storage_key"),
        created_at: row.get::<i64, _>("created_at") as u64,
        deleted_at: row
            .get::<Option<i64>, _>("deleted_at")
            .map(|value| value as u64),
    }
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
        assert!((items[0].confidence - 0.9).abs() < 0.001);
        let sources = store
            .list_memory_sources(second_owner, items[0].id)
            .await
            .expect("merged sources should list");
        assert_eq!(sources.len(), 2);

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
