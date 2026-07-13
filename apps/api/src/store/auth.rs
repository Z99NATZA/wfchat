use super::*;

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

            recalculate_memory_evidence(&mut tx, &[account_id]).await?;
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
            "update memory_extraction_jobs
             set owner_user_id = $1, updated_at = now()
             where owner_session_id = $2 and owner_user_id is null",
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

    #[cfg(test)]
    pub(crate) async fn delete_session_for_test(&self, session_id: Uuid) -> StoreResult<()> {
        sqlx::query("delete from auth_sessions where id = $1")
            .bind(session_id)
            .execute(self.db.as_ref())
            .await?;
        Ok(())
    }

    async fn run_migrations(&self) -> Result<(), sqlx::Error> {
        sqlx::migrate!("./migrations").run(self.db.as_ref()).await?;
        Ok(())
    }
}
