use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::Value;
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

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct MemoryFactRecord {
    pub id: Uuid,
    pub owner_session_id: Uuid,
    pub character_id: String,
    pub content: String,
    pub confidence: f32,
    pub source_chat_id: Option<Uuid>,
    pub created_at: u64,
    pub updated_at: u64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct MemorySummaryRecord {
    pub id: Uuid,
    pub owner_session_id: Uuid,
    pub character_id: String,
    pub summary: String,
    pub source_chat_id: Option<Uuid>,
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

    pub async fn promote_session_to_registered(
        &self,
        session_id: Uuid,
        user_id: Uuid,
    ) -> Option<SessionRecord> {
        let row = sqlx::query(
            "update auth_sessions
             set user_id = $1, kind = 'registered'
             where id = $2
             returning id, user_id, kind, extract(epoch from created_at)::bigint as created_at",
        )
        .bind(user_id)
        .bind(session_id)
        .fetch_optional(self.db.as_ref())
        .await
        .ok()??;

        Some(SessionRecord {
            id: row.get("id"),
            user_id: row.get("user_id"),
            kind: parse_user_kind(row.get::<String, _>("kind").as_str()),
            created_at: row.get::<i64, _>("created_at") as u64,
        })
    }

    pub async fn migrate_session_data_to_user(&self, session_id: Uuid, user_id: Uuid) {
        let _ = sqlx::query(
            "update chats set owner_user_id = $1 where owner_session_id = $2 and owner_user_id is null",
        )
        .bind(user_id)
        .bind(session_id)
        .execute(self.db.as_ref())
        .await;

        let _ = sqlx::query(
            "update memory_facts set owner_user_id = $1 where owner_session_id = $2 and owner_user_id is null",
        )
        .bind(user_id)
        .bind(session_id)
        .execute(self.db.as_ref())
        .await;

        let _ = sqlx::query(
            "update memory_summaries set owner_user_id = $1 where owner_session_id = $2 and owner_user_id is null",
        )
        .bind(user_id)
        .bind(session_id)
        .execute(self.db.as_ref())
        .await;

        let _ = sqlx::query(
            "update sync_entities set owner_user_id = $1 where session_id = $2 and owner_user_id is null",
        )
        .bind(user_id)
        .bind(session_id)
        .execute(self.db.as_ref())
        .await;
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
            kind: parse_user_kind(row.get::<String, _>("kind").as_str()),
            created_at: row.get::<i64, _>("created_at") as u64,
        })
    }

    pub async fn list_chats(&self, owner: OwnerScope) -> Vec<ChatRecord> {
        let rows = sqlx::query(
            "select id, owner_session_id, character_id, ai_profile_id, extract(epoch from created_at)::bigint as created_at, extract(epoch from updated_at)::bigint as updated_at
             from chats
             where (($2::uuid is not null and owner_user_id = $2) or ($2::uuid is null and owner_session_id = $1))
             order by updated_at desc",
        )
        .bind(owner.session_id)
        .bind(owner.user_id)
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
        owner: OwnerScope,
        character_id: String,
        ai_profile_id: String,
    ) -> ChatRecord {
        let id = Uuid::new_v4();
        let now = now_unix_seconds() as i64;
        let _ = sqlx::query(
            "insert into chats (id, owner_session_id, owner_user_id, character_id, ai_profile_id, created_at, updated_at) values ($1, $2, $3, $4, $5, to_timestamp($6), to_timestamp($6))",
        )
        .bind(id)
        .bind(owner.session_id)
        .bind(owner.user_id)
        .bind(&character_id)
        .bind(&ai_profile_id)
        .bind(now)
        .execute(self.db.as_ref())
        .await;

        ChatRecord {
            id,
            owner_session_id: owner.session_id,
            character_id,
            ai_profile_id,
            messages: Vec::new(),
            created_at: now as u64,
            updated_at: now as u64,
        }
    }

    pub async fn get_chat(&self, owner: OwnerScope, chat_id: Uuid) -> Option<ChatRecord> {
        let row = sqlx::query(
            "select id, owner_session_id, character_id, ai_profile_id, extract(epoch from created_at)::bigint as created_at, extract(epoch from updated_at)::bigint as updated_at
             from chats
             where id = $1 and (($3::uuid is not null and owner_user_id = $3) or ($3::uuid is null and owner_session_id = $2))",
        )
        .bind(chat_id)
        .bind(owner.session_id)
        .bind(owner.user_id)
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
        owner: OwnerScope,
        chat_id: Uuid,
        user_message: StoredMessage,
        assistant_message: StoredMessage,
    ) -> Option<ChatRecord> {
        let owner_exists = sqlx::query(
            "select id from chats where id = $1 and (($3::uuid is not null and owner_user_id = $3) or ($3::uuid is null and owner_session_id = $2))",
        )
            .bind(chat_id)
            .bind(owner.session_id)
            .bind(owner.user_id)
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

        self.get_chat(owner, chat_id).await
    }

    pub async fn clear_chat_messages(
        &self,
        owner: OwnerScope,
        chat_id: Uuid,
    ) -> Option<ChatRecord> {
        let owner_exists = sqlx::query(
            "select id from chats where id = $1 and (($3::uuid is not null and owner_user_id = $3) or ($3::uuid is null and owner_session_id = $2))",
        )
            .bind(chat_id)
            .bind(owner.session_id)
            .bind(owner.user_id)
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

        self.get_chat(owner, chat_id).await
    }

    pub async fn delete_chat(&self, owner: OwnerScope, chat_id: Uuid) -> bool {
        sqlx::query(
            "delete from chats where id = $1 and (($3::uuid is not null and owner_user_id = $3) or ($3::uuid is null and owner_session_id = $2))",
        )
            .bind(chat_id)
            .bind(owner.session_id)
            .bind(owner.user_id)
            .execute(self.db.as_ref())
            .await
            .map(|result| result.rows_affected() > 0)
            .unwrap_or(false)
    }

    pub async fn list_memory_facts(
        &self,
        owner: OwnerScope,
        character_id: &str,
    ) -> Vec<MemoryFactRecord> {
        let rows = sqlx::query(
            "select id, owner_session_id, character_id, content, confidence, source_chat_id, extract(epoch from created_at)::bigint as created_at, extract(epoch from updated_at)::bigint as updated_at
             from memory_facts
             where (($3::uuid is not null and owner_user_id = $3) or ($3::uuid is null and owner_session_id = $1)) and character_id = $2
             order by updated_at desc",
        )
        .bind(owner.session_id)
        .bind(character_id)
        .bind(owner.user_id)
        .fetch_all(self.db.as_ref())
        .await
        .unwrap_or_default();

        rows.into_iter()
            .map(|row| MemoryFactRecord {
                id: row.get("id"),
                owner_session_id: row.get("owner_session_id"),
                character_id: row.get("character_id"),
                content: row.get("content"),
                confidence: row.get::<f64, _>("confidence") as f32,
                source_chat_id: row.get("source_chat_id"),
                created_at: row.get::<i64, _>("created_at") as u64,
                updated_at: row.get::<i64, _>("updated_at") as u64,
            })
            .collect()
    }

    pub async fn create_memory_fact(
        &self,
        owner: OwnerScope,
        character_id: String,
        content: String,
        confidence: f32,
        source_chat_id: Option<Uuid>,
    ) -> Option<MemoryFactRecord> {
        let id = Uuid::new_v4();
        let row = sqlx::query(
            "insert into memory_facts (id, owner_session_id, owner_user_id, character_id, content, confidence, source_chat_id) values ($1, $2, $3, $4, $5, $6, $7) returning extract(epoch from created_at)::bigint as created_at, extract(epoch from updated_at)::bigint as updated_at",
        )
        .bind(id)
        .bind(owner.session_id)
        .bind(owner.user_id)
        .bind(&character_id)
        .bind(&content)
        .bind(confidence as f64)
        .bind(source_chat_id)
        .fetch_one(self.db.as_ref())
        .await
        .ok()?;

        Some(MemoryFactRecord {
            id,
            owner_session_id: owner.session_id,
            character_id,
            content,
            confidence,
            source_chat_id,
            created_at: row.get::<i64, _>("created_at") as u64,
            updated_at: row.get::<i64, _>("updated_at") as u64,
        })
    }

    pub async fn delete_memory_fact(&self, owner: OwnerScope, fact_id: Uuid) -> bool {
        sqlx::query(
            "delete from memory_facts where id = $1 and (($3::uuid is not null and owner_user_id = $3) or ($3::uuid is null and owner_session_id = $2))",
        )
            .bind(fact_id)
            .bind(owner.session_id)
            .bind(owner.user_id)
            .execute(self.db.as_ref())
            .await
            .map(|result| result.rows_affected() > 0)
            .unwrap_or(false)
    }

    pub async fn update_memory_fact(
        &self,
        owner: OwnerScope,
        fact_id: Uuid,
        content: String,
        confidence: f32,
    ) -> Option<MemoryFactRecord> {
        let row = sqlx::query(
            "update memory_facts
             set content = $1, confidence = $2, updated_at = now()
             where id = $3 and (($5::uuid is not null and owner_user_id = $5) or ($5::uuid is null and owner_session_id = $4))
             returning id, owner_session_id, character_id, content, confidence, source_chat_id, extract(epoch from created_at)::bigint as created_at, extract(epoch from updated_at)::bigint as updated_at",
        )
        .bind(&content)
        .bind(confidence as f64)
        .bind(fact_id)
        .bind(owner.session_id)
        .bind(owner.user_id)
        .fetch_optional(self.db.as_ref())
        .await
        .ok()??;

        Some(MemoryFactRecord {
            id: row.get("id"),
            owner_session_id: row.get("owner_session_id"),
            character_id: row.get("character_id"),
            content: row.get("content"),
            confidence: row.get::<f64, _>("confidence") as f32,
            source_chat_id: row.get("source_chat_id"),
            created_at: row.get::<i64, _>("created_at") as u64,
            updated_at: row.get::<i64, _>("updated_at") as u64,
        })
    }

    pub async fn list_memory_summaries(
        &self,
        owner: OwnerScope,
        character_id: &str,
    ) -> Vec<MemorySummaryRecord> {
        let rows = sqlx::query(
            "select id, owner_session_id, character_id, summary, source_chat_id, extract(epoch from created_at)::bigint as created_at
             from memory_summaries
             where (($3::uuid is not null and owner_user_id = $3) or ($3::uuid is null and owner_session_id = $1)) and character_id = $2
             order by created_at desc",
        )
        .bind(owner.session_id)
        .bind(character_id)
        .bind(owner.user_id)
        .fetch_all(self.db.as_ref())
        .await
        .unwrap_or_default();

        rows.into_iter()
            .map(|row| MemorySummaryRecord {
                id: row.get("id"),
                owner_session_id: row.get("owner_session_id"),
                character_id: row.get("character_id"),
                summary: row.get("summary"),
                source_chat_id: row.get("source_chat_id"),
                created_at: row.get::<i64, _>("created_at") as u64,
            })
            .collect()
    }

    pub async fn create_memory_summary(
        &self,
        owner: OwnerScope,
        character_id: String,
        summary: String,
        source_chat_id: Option<Uuid>,
    ) -> Option<MemorySummaryRecord> {
        let id = Uuid::new_v4();
        let row = sqlx::query(
            "insert into memory_summaries (id, owner_session_id, owner_user_id, character_id, summary, source_chat_id) values ($1, $2, $3, $4, $5, $6) returning extract(epoch from created_at)::bigint as created_at",
        )
        .bind(id)
        .bind(owner.session_id)
        .bind(owner.user_id)
        .bind(&character_id)
        .bind(&summary)
        .bind(source_chat_id)
        .fetch_one(self.db.as_ref())
        .await
        .ok()?;

        Some(MemorySummaryRecord {
            id,
            owner_session_id: owner.session_id,
            character_id,
            summary,
            source_chat_id,
            created_at: row.get::<i64, _>("created_at") as u64,
        })
    }

    pub async fn delete_memory_summary(&self, owner: OwnerScope, summary_id: Uuid) -> bool {
        sqlx::query(
            "delete from memory_summaries where id = $1 and (($3::uuid is not null and owner_user_id = $3) or ($3::uuid is null and owner_session_id = $2))",
        )
            .bind(summary_id)
            .bind(owner.session_id)
            .bind(owner.user_id)
            .execute(self.db.as_ref())
            .await
            .map(|result| result.rows_affected() > 0)
            .unwrap_or(false)
    }

    pub async fn update_memory_summary(
        &self,
        owner: OwnerScope,
        summary_id: Uuid,
        summary: String,
    ) -> Option<MemorySummaryRecord> {
        let row = sqlx::query(
            "update memory_summaries
             set summary = $1
             where id = $2 and (($4::uuid is not null and owner_user_id = $4) or ($4::uuid is null and owner_session_id = $3))
             returning id, owner_session_id, character_id, summary, source_chat_id, extract(epoch from created_at)::bigint as created_at",
        )
        .bind(&summary)
        .bind(summary_id)
        .bind(owner.session_id)
        .bind(owner.user_id)
        .fetch_optional(self.db.as_ref())
        .await
        .ok()??;

        Some(MemorySummaryRecord {
            id: row.get("id"),
            owner_session_id: row.get("owner_session_id"),
            character_id: row.get("character_id"),
            summary: row.get("summary"),
            source_chat_id: row.get("source_chat_id"),
            created_at: row.get::<i64, _>("created_at") as u64,
        })
    }

    pub async fn count_sync_entities(&self, owner: OwnerScope) -> u32 {
        let entities_count: i64 = sqlx::query_scalar(
            "select count(*) from sync_entities where (($2::uuid is not null and owner_user_id = $2) or ($2::uuid is null and session_id = $1))",
        )
        .bind(owner.session_id)
        .bind(owner.user_id)
        .fetch_one(self.db.as_ref())
        .await
        .unwrap_or(0);
        entities_count.max(0) as u32
    }

    pub async fn upsert_sync_entity(&self, entity: &SyncEntityRecord) -> bool {
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
            .await
            .map(|result| result.rows_affected() > 0)
            .unwrap_or(false);
            if updated {
                return true;
            }

            let exists = sqlx::query_scalar::<_, i64>(
                "select count(*) from sync_entities where owner_user_id = $1 and item_id = $2",
            )
            .bind(owner_user_id)
            .bind(&entity.item_id)
            .fetch_one(self.db.as_ref())
            .await
            .map(|count| count > 0)
            .unwrap_or(false);
            if exists {
                return false;
            }

            return sqlx::query(
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
            .await
            .is_ok();
        }

        sqlx::query(
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
        .await
        .is_ok()
    }

    pub async fn get_sync_entity_updated_at(
        &self,
        owner: OwnerScope,
        item_id: &str,
    ) -> Option<u64> {
        let value: Option<i64> = sqlx::query_scalar(
            "select max(extract(epoch from updated_at)::bigint)
             from sync_entities
             where (($3::uuid is not null and owner_user_id = $3) or ($3::uuid is null and session_id = $1)) and item_id = $2",
        )
        .bind(owner.session_id)
        .bind(item_id)
        .bind(owner.user_id)
        .fetch_one(self.db.as_ref())
        .await
        .ok()?;

        value.map(|item| item as u64)
    }

    pub async fn list_sync_entities_since(
        &self,
        owner: OwnerScope,
        cursor: u64,
        limit: u32,
    ) -> Vec<SyncEntityRecord> {
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
        .await
        .unwrap_or_default();

        rows.into_iter()
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
            .collect()
    }

    pub async fn get_sync_commit(
        &self,
        session_id: Uuid,
        operation_id: &str,
    ) -> Option<SyncCommitRecord> {
        let row = sqlx::query(
            "select operation_id, session_id, user_id, merged_count, conflict_count, extract(epoch from committed_at)::bigint as committed_at
             from sync_commits
             where session_id = $1 and operation_id = $2",
        )
        .bind(session_id)
        .bind(operation_id)
        .fetch_optional(self.db.as_ref())
        .await
        .ok()??;

        Some(SyncCommitRecord {
            operation_id: row.get("operation_id"),
            session_id: row.get("session_id"),
            user_id: row.get("user_id"),
            merged_count: row.get::<i32, _>("merged_count") as u32,
            conflict_count: row.get::<i32, _>("conflict_count") as u32,
            committed_at: row.get::<i64, _>("committed_at") as u64,
        })
    }

    pub async fn save_sync_commit(
        &self,
        session_id: Uuid,
        user_id: Uuid,
        operation_id: &str,
        merged_count: u32,
        conflict_count: u32,
    ) -> Option<SyncCommitRecord> {
        if let Some(existing) = self.get_sync_commit(session_id, operation_id).await {
            return Some(existing);
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
        .await
        .ok()?;

        if row.is_none() {
            return self.get_sync_commit(session_id, operation_id).await;
        }

        Some(SyncCommitRecord {
            operation_id: operation_id.to_owned(),
            session_id,
            user_id,
            merged_count,
            conflict_count,
            committed_at: row?.get::<i64, _>("committed_at") as u64,
        })
    }

    async fn messages_for_chat(&self, chat_id: Uuid) -> Vec<StoredMessage> {
        let rows = sqlx::query(
            "select id, role, content, extract(epoch from created_at)::bigint as created_at from chat_messages where chat_id = $1 order by sort_order asc",
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
                owner_user_id uuid,
                character_id text not null,
                ai_profile_id text not null,
                created_at timestamptz not null default now(),
                updated_at timestamptz not null default now()
            )",
        )
        .execute(self.db.as_ref())
        .await?;
        sqlx::query("alter table chats add column if not exists owner_user_id uuid")
            .execute(self.db.as_ref())
            .await?;

        sqlx::query(
            "create table if not exists chat_messages (
                id uuid primary key,
                chat_id uuid not null references chats(id) on delete cascade,
                sort_order bigserial not null,
                role text not null,
                content text not null,
                created_at timestamptz not null default now()
            )",
        )
        .execute(self.db.as_ref())
        .await?;
        sqlx::query("alter table chat_messages add column if not exists sort_order bigserial")
            .execute(self.db.as_ref())
            .await?;

        sqlx::query("create index if not exists idx_chats_owner_updated on chats(owner_session_id, updated_at desc)")
            .execute(self.db.as_ref())
            .await?;
        sqlx::query("create index if not exists idx_chats_owner_character_updated on chats(owner_session_id, character_id, updated_at desc)")
            .execute(self.db.as_ref())
            .await?;
        sqlx::query("create index if not exists idx_chats_owner_user_updated on chats(owner_user_id, updated_at desc)")
            .execute(self.db.as_ref())
            .await?;
        sqlx::query("create index if not exists idx_chats_owner_user_character_updated on chats(owner_user_id, character_id, updated_at desc)")
            .execute(self.db.as_ref())
            .await?;
        sqlx::query("create index if not exists idx_messages_chat_created on chat_messages(chat_id, created_at asc)")
            .execute(self.db.as_ref())
            .await?;
        sqlx::query("create index if not exists idx_messages_chat_sort on chat_messages(chat_id, sort_order asc)")
            .execute(self.db.as_ref())
            .await?;
        sqlx::query(
            "create table if not exists memory_facts (
                id uuid primary key,
                owner_session_id uuid not null references auth_sessions(id) on delete cascade,
                owner_user_id uuid,
                character_id text not null,
                content text not null,
                confidence double precision not null default 0.5,
                source_chat_id uuid references chats(id) on delete set null,
                created_at timestamptz not null default now(),
                updated_at timestamptz not null default now()
            )",
        )
        .execute(self.db.as_ref())
        .await?;
        sqlx::query(
            "create table if not exists memory_summaries (
                id uuid primary key,
                owner_session_id uuid not null references auth_sessions(id) on delete cascade,
                owner_user_id uuid,
                character_id text not null,
                summary text not null,
                source_chat_id uuid references chats(id) on delete set null,
                created_at timestamptz not null default now()
            )",
        )
        .execute(self.db.as_ref())
        .await?;
        sqlx::query("alter table memory_facts add column if not exists owner_user_id uuid")
            .execute(self.db.as_ref())
            .await?;
        sqlx::query("alter table memory_summaries add column if not exists owner_user_id uuid")
            .execute(self.db.as_ref())
            .await?;
        sqlx::query("create index if not exists idx_memory_facts_owner_character_updated on memory_facts(owner_session_id, character_id, updated_at desc)")
            .execute(self.db.as_ref())
            .await?;
        sqlx::query("create index if not exists idx_memory_summaries_owner_character_created on memory_summaries(owner_session_id, character_id, created_at desc)")
            .execute(self.db.as_ref())
            .await?;
        sqlx::query("create index if not exists idx_memory_facts_owner_user_character_updated on memory_facts(owner_user_id, character_id, updated_at desc)")
            .execute(self.db.as_ref())
            .await?;
        sqlx::query("create index if not exists idx_memory_summaries_owner_user_character_created on memory_summaries(owner_user_id, character_id, created_at desc)")
            .execute(self.db.as_ref())
            .await?;
        sqlx::query(
            "create table if not exists sync_commits (
                operation_id text not null,
                session_id uuid not null references auth_sessions(id) on delete cascade,
                user_id uuid not null,
                merged_count integer not null,
                conflict_count integer not null,
                committed_at timestamptz not null default now(),
                primary key (operation_id, session_id)
            )",
        )
        .execute(self.db.as_ref())
        .await?;
        sqlx::query("create index if not exists idx_sync_commits_session_committed on sync_commits(session_id, committed_at desc)")
            .execute(self.db.as_ref())
            .await?;
        sqlx::query(
            "create table if not exists sync_entities (
                session_id uuid not null references auth_sessions(id) on delete cascade,
                owner_user_id uuid,
                item_id text not null,
                item_type text not null,
                updated_at timestamptz not null,
                deleted_at timestamptz,
                payload jsonb not null default '{}'::jsonb,
                primary key (session_id, item_id)
            )",
        )
        .execute(self.db.as_ref())
        .await?;
        sqlx::query("alter table sync_entities add column if not exists owner_user_id uuid")
            .execute(self.db.as_ref())
            .await?;
        sqlx::query("create index if not exists idx_sync_entities_session_updated on sync_entities(session_id, updated_at desc)")
            .execute(self.db.as_ref())
            .await?;
        sqlx::query("create index if not exists idx_sync_entities_owner_user_updated on sync_entities(owner_user_id, updated_at desc)")
            .execute(self.db.as_ref())
            .await?;
        sqlx::query("create index if not exists idx_sync_entities_owner_user_item on sync_entities(owner_user_id, item_id)")
            .execute(self.db.as_ref())
            .await?;
        sqlx::query(
            "update chats
             set owner_user_id = auth_sessions.user_id
             from auth_sessions
             where chats.owner_session_id = auth_sessions.id
               and auth_sessions.kind <> 'guest'
               and chats.owner_user_id is null",
        )
        .execute(self.db.as_ref())
        .await?;
        sqlx::query(
            "update memory_facts
             set owner_user_id = auth_sessions.user_id
             from auth_sessions
             where memory_facts.owner_session_id = auth_sessions.id
               and auth_sessions.kind <> 'guest'
               and memory_facts.owner_user_id is null",
        )
        .execute(self.db.as_ref())
        .await?;
        sqlx::query(
            "update memory_summaries
             set owner_user_id = auth_sessions.user_id
             from auth_sessions
             where memory_summaries.owner_session_id = auth_sessions.id
               and auth_sessions.kind <> 'guest'
               and memory_summaries.owner_user_id is null",
        )
        .execute(self.db.as_ref())
        .await?;
        sqlx::query(
            "update sync_entities
             set owner_user_id = auth_sessions.user_id
             from auth_sessions
             where sync_entities.session_id = auth_sessions.id
               and auth_sessions.kind <> 'guest'
               and sync_entities.owner_user_id is null",
        )
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

fn parse_user_kind(value: &str) -> UserKind {
    match value {
        "registered" => UserKind::Registered,
        "admin" => UserKind::Admin,
        _ => UserKind::Guest,
    }
}

#[cfg(test)]
mod integration_tests {
    use super::*;
    use serde_json::json;

    async fn test_store() -> Option<ChatStore> {
        let database_url = std::env::var("WFCHAT_TEST_DATABASE_URL").ok()?;
        ChatStore::connect(&database_url).await.ok()
    }

    async fn cleanup_sessions(store: &ChatStore, session_ids: &[Uuid]) {
        for session_id in session_ids {
            let _ = sqlx::query("delete from auth_sessions where id = $1")
                .bind(session_id)
                .execute(store.db.as_ref())
                .await;
        }
    }

    #[tokio::test]
    async fn registered_owner_reads_chats_across_sessions() {
        let Some(store) = test_store().await else {
            return;
        };
        let user_id = Uuid::new_v4();
        let first_session = store.create_guest_session().await;
        let first_session = store
            .promote_session_to_registered(first_session.id, user_id)
            .await
            .expect("first session should promote");
        store
            .migrate_session_data_to_user(first_session.id, first_session.user_id)
            .await;
        let first_owner = OwnerScope::from_session(&first_session);
        let chat = store
            .create_chat(first_owner, "aiko".to_owned(), "aiko_default".to_owned())
            .await;

        let second_session = store.create_guest_session().await;
        let second_session = store
            .promote_session_to_registered(second_session.id, user_id)
            .await
            .expect("second session should promote");
        let second_owner = OwnerScope::from_session(&second_session);

        let chats = store.list_chats(second_owner).await;
        assert!(chats.iter().any(|item| item.id == chat.id));

        cleanup_sessions(&store, &[first_session.id, second_session.id]).await;
    }

    #[tokio::test]
    async fn registered_owner_sync_entities_across_sessions() {
        let Some(store) = test_store().await else {
            return;
        };
        let user_id = Uuid::new_v4();
        let first_session = store.create_guest_session().await;
        let first_session = store
            .promote_session_to_registered(first_session.id, user_id)
            .await
            .expect("first session should promote");
        let first_owner = OwnerScope::from_session(&first_session);

        let second_session = store.create_guest_session().await;
        let second_session = store
            .promote_session_to_registered(second_session.id, user_id)
            .await
            .expect("second session should promote");
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
            .await;
        assert!(saved);

        let pulled = store.list_sync_entities_since(second_owner, 0, 100).await;
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
            .await;
        assert!(updated);

        let pulled = store.list_sync_entities_since(first_owner, 0, 100).await;
        assert_eq!(pulled.len(), 1);
        assert_eq!(pulled[0].updated_at, 12);
        assert_eq!(pulled[0].payload["value"], "light");

        cleanup_sessions(&store, &[first_session.id, second_session.id]).await;
    }
}
