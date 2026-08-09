use super::*;

impl ChatStore {
    pub async fn connect(database_url: &str) -> Result<Self, sqlx::Error> {
        let db = PgPool::connect(database_url).await?;
        let store = Self {
            db: Arc::new(db),
            #[cfg(test)]
            auth_sessions_created: Arc::new(std::sync::atomic::AtomicUsize::new(0)),
        };
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

        #[cfg(test)]
        self.auth_sessions_created
            .fetch_add(1, std::sync::atomic::Ordering::Relaxed);

        Ok(session)
    }

    #[cfg(test)]
    pub(crate) fn auth_session_creation_count_for_test(&self) -> usize {
        self.auth_sessions_created
            .load(std::sync::atomic::Ordering::Relaxed)
    }

    pub async fn logout_registered_session_to_guest(
        &self,
        session_id: Uuid,
    ) -> StoreResult<Option<SessionRecord>> {
        let mut tx = self.db.begin().await?;
        let session = sqlx::query(
            "select kind, user_id
             from auth_sessions
             where id = $1 and revoked_at is null and expires_at > now()
             for update",
        )
        .bind(session_id)
        .fetch_optional(&mut *tx)
        .await?;
        let Some(session) = session else {
            tx.rollback().await?;
            return Ok(None);
        };
        let session_kind: String = session.get("kind");
        if !matches!(session_kind.as_str(), "registered" | "admin") {
            tx.rollback().await?;
            return Ok(None);
        }
        let quota_carryover_user_id: Uuid = session.get("user_id");

        sqlx::query("update auth_sessions set revoked_at = now() where id = $1")
            .bind(session_id)
            .execute(&mut *tx)
            .await?;

        let guest = SessionRecord {
            id: Uuid::new_v4(),
            user_id: Uuid::new_v4(),
            kind: UserKind::Guest,
            created_at: now_unix_seconds(),
        };
        sqlx::query(
            "insert into auth_sessions (
               id, user_id, kind, created_at,
               quota_carryover_user_id, quota_carryover_date
             )
             values (
               $1, $2, 'guest', to_timestamp($3), $4,
               (now() at time zone 'Asia/Bangkok')::date
             )",
        )
        .bind(guest.id)
        .bind(guest.user_id)
        .bind(guest.created_at as i64)
        .bind(quota_carryover_user_id)
        .execute(&mut *tx)
        .await?;

        #[cfg(test)]
        self.auth_sessions_created
            .fetch_add(1, std::sync::atomic::Ordering::Relaxed);

        tx.commit().await?;
        Ok(Some(guest))
    }

    pub async fn cleanup_inactive_guest_sessions(&self) -> StoreResult<u64> {
        let mut tx = self.db.begin().await?;
        sqlx::query("select wfchat_reparent_legacy_promoted_guests(1000)")
            .execute(&mut *tx)
            .await?;
        sqlx::query("select wfchat_reparent_legacy_attachment_deletions(1000)")
            .execute(&mut *tx)
            .await?;
        let result = sqlx::query(
            "delete from auth_sessions
             where id in (
               select id
               from auth_sessions
               where kind = 'guest'
                 and (revoked_at is not null or expires_at <= now())
                 and not exists (
                   select 1 from chats
                   where owner_session_id = auth_sessions.id and owner_user_id is not null
                 )
                 and not exists (
                   select 1 from chat_attachments
                   where owner_session_id = auth_sessions.id and owner_user_id is not null
                 )
                 and not exists (
                   select 1 from memory_items
                   where owner_session_id = auth_sessions.id and owner_user_id is not null
                 )
                 and not exists (
                   select 1 from memory_extraction_jobs
                   where owner_session_id = auth_sessions.id and owner_user_id is not null
                 )
                 and not exists (
                   select 1 from memory_follow_up_deliveries
                   where owner_session_id = auth_sessions.id and owner_user_id is not null
                 )
                 and not exists (
                   select 1 from sync_entities
                   where session_id = auth_sessions.id and owner_user_id is not null
                 )
                 and not exists (
                   select 1 from sync_commits
                   where session_id = auth_sessions.id and user_id <> auth_sessions.user_id
                 )
                 and not exists (
                   select 1 from cafe_progress
                   where owner_session_id = auth_sessions.id and owner_user_id is not null
                 )
                 and not exists (
                   select 1 from cafe_cosmetic_loadouts
                   where owner_session_id = auth_sessions.id and owner_user_id is not null
                 )
                 and not exists (
                   select 1 from cafe_room_rewards
                   where owner_session_id = auth_sessions.id and owner_user_id is not null
                 )
               order by coalesce(revoked_at, expires_at), id
               limit 1000
             )",
        )
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;
        Ok(result.rows_affected())
    }

    pub async fn promote_session_to_registered(
        &self,
        session_id: Uuid,
        user_id: Uuid,
    ) -> StoreResult<Option<SessionRecord>> {
        let row = sqlx::query(
            "update auth_sessions
             set user_id = $1, kind = 'registered'
             where id = $2 and revoked_at is null and expires_at > now()
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
             where id = $2 and revoked_at is null and expires_at > now()
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
        Self::migrate_session_data_to_user_in_tx(&mut tx, session_id, user_id).await?;
        tx.commit().await?;
        Ok(())
    }

    async fn migrate_session_data_to_user_in_tx(
        tx: &mut Transaction<'_, Postgres>,
        session_id: Uuid,
        user_id: Uuid,
    ) -> StoreResult<()> {
        Self::transfer_session_daily_quota_to_account_in_tx(tx, session_id, user_id).await?;

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
        .fetch_all(&mut **tx)
        .await?;

        for row in duplicate_memories {
            let guest_id: Uuid = row.get("guest_id");
            let account_id: Uuid = row.get("account_id");

            sqlx::query(
                "update memory_follow_up_deliveries
                 set memory_id = $1
                 where memory_id = $2",
            )
            .bind(account_id)
            .bind(guest_id)
            .execute(&mut **tx)
            .await?;

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
            .execute(&mut **tx)
            .await?;

            sqlx::query("update memory_sources set memory_id = $1 where memory_id = $2")
                .bind(account_id)
                .bind(guest_id)
                .execute(&mut **tx)
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
            .execute(&mut **tx)
            .await?;

            sqlx::query("delete from memory_items where id = $1")
                .bind(guest_id)
                .execute(&mut **tx)
                .await?;

            recalculate_memory_evidence(tx, &[account_id]).await?;
        }

        sqlx::query(
            "update chats set owner_user_id = $1 where owner_session_id = $2 and owner_user_id is null",
        )
        .bind(user_id)
        .bind(session_id)
        .execute(&mut **tx)
        .await?;

        sqlx::query(
            "update chat_attachments
             set owner_user_id = $1
             where owner_session_id = $2 and owner_user_id is null",
        )
        .bind(user_id)
        .bind(session_id)
        .execute(&mut **tx)
        .await?;

        sqlx::query(
            "update chat_attachment_file_deletions
             set owner_user_id = $1
             where owner_session_id = $2 and owner_user_id is null",
        )
        .bind(user_id)
        .bind(session_id)
        .execute(&mut **tx)
        .await?;

        sqlx::query(
            "update memory_items set owner_user_id = $1 where owner_session_id = $2 and owner_user_id is null",
        )
        .bind(user_id)
        .bind(session_id)
        .execute(&mut **tx)
        .await?;

        sqlx::query(
            "update memory_extraction_jobs
             set owner_user_id = $1, updated_at = now()
             where owner_session_id = $2 and owner_user_id is null",
        )
        .bind(user_id)
        .bind(session_id)
        .execute(&mut **tx)
        .await?;

        sqlx::query(
            "update memory_follow_up_deliveries
             set owner_user_id = $1
             where owner_session_id = $2 and owner_user_id is null",
        )
        .bind(user_id)
        .bind(session_id)
        .execute(&mut **tx)
        .await?;

        sqlx::query(
            "update sync_entities set owner_user_id = $1 where session_id = $2 and owner_user_id is null",
        )
        .bind(user_id)
        .bind(session_id)
        .execute(&mut **tx)
        .await?;

        sqlx::query(
            "update cafe_progress set owner_user_id = $1, updated_at = now()
             where owner_session_id = $2 and owner_user_id is null",
        )
        .bind(user_id)
        .bind(session_id)
        .execute(&mut **tx)
        .await?;

        sqlx::query(
            "update cafe_cosmetic_loadouts set owner_user_id = $1, updated_at = now()
             where owner_session_id = $2 and owner_user_id is null",
        )
        .bind(user_id)
        .bind(session_id)
        .execute(&mut **tx)
        .await?;

        sqlx::query(
            "update cafe_room_rewards set owner_user_id = $1
             where owner_session_id = $2 and owner_user_id is null",
        )
        .bind(user_id)
        .bind(session_id)
        .execute(&mut **tx)
        .await?;

        Ok(())
    }

    async fn reparent_promoted_session_data_in_tx(
        tx: &mut Transaction<'_, Postgres>,
        old_session_id: Uuid,
        replacement_session_id: Uuid,
    ) -> StoreResult<()> {
        for table in [
            "chats",
            "chat_attachments",
            "chat_attachment_file_deletions",
            "memory_items",
            "memory_extraction_jobs",
            "memory_follow_up_deliveries",
            "cafe_progress",
            "cafe_cosmetic_loadouts",
            "cafe_room_rewards",
        ] {
            let query =
                format!("update {table} set owner_session_id = $1 where owner_session_id = $2");
            sqlx::query(&query)
                .bind(replacement_session_id)
                .bind(old_session_id)
                .execute(&mut **tx)
                .await?;
        }
        for table in ["sync_entities", "sync_commits"] {
            let query = format!("update {table} set session_id = $1 where session_id = $2");
            sqlx::query(&query)
                .bind(replacement_session_id)
                .bind(old_session_id)
                .execute(&mut **tx)
                .await?;
        }

        Ok(())
    }

    pub async fn promote_guest_session_with_google(
        &self,
        session_id: Uuid,
        user_id: Uuid,
        provider_subject: &str,
        email: Option<String>,
        provider_name: Option<String>,
        provider_avatar_url: Option<String>,
    ) -> StoreResult<Option<SessionRecord>> {
        self.promote_guest_session_with_google_inner(
            session_id,
            user_id,
            GoogleIdentityInput {
                provider_subject,
                email,
                provider_name,
                provider_avatar_url,
            },
            None,
        )
        .await
    }

    async fn promote_guest_session_with_google_inner(
        &self,
        session_id: Uuid,
        user_id: Uuid,
        identity: GoogleIdentityInput<'_>,
        test_control: Option<GooglePromotionTestControl>,
    ) -> StoreResult<Option<SessionRecord>> {
        let mut tx = self.db.begin().await?;
        let locked = sqlx::query(
            "select kind from auth_sessions
             where id = $1 and revoked_at is null and expires_at > now()
             for update",
        )
        .bind(session_id)
        .fetch_optional(&mut *tx)
        .await?;
        let Some(locked) = locked else {
            return Ok(None);
        };
        if locked.get::<String, _>("kind") != "guest" {
            return Ok(None);
        }

        if let Some(control) = &test_control {
            control.after_lock.notify_one();
            control.continue_after_lock.notified().await;
        }

        Self::migrate_session_data_to_user_in_tx(&mut tx, session_id, user_id).await?;

        sqlx::query(
            "insert into auth_identities (user_id, provider, provider_subject, email, provider_name, provider_avatar_url, updated_at)
             values ($1, 'google', $2, $3, $4, $5, now())
             on conflict (provider, provider_subject)
             do update set
               user_id = excluded.user_id,
               email = excluded.email,
               provider_name = excluded.provider_name,
               provider_avatar_url = excluded.provider_avatar_url,
               updated_at = now()",
        )
        .bind(user_id)
        .bind(identity.provider_subject)
        .bind(identity.email)
        .bind(identity.provider_name.clone())
        .bind(identity.provider_avatar_url.clone())
        .execute(&mut *tx)
        .await?;

        let seed_display_name =
            non_empty_string(identity.provider_name).unwrap_or_else(|| "Member".to_owned());
        let seed_avatar_url = non_empty_string(identity.provider_avatar_url);
        sqlx::query(
            "insert into user_profiles (user_id, display_name, avatar_url, created_at, updated_at)
             values ($1, $2, $3, now(), now())
             on conflict (user_id) do nothing",
        )
        .bind(user_id)
        .bind(seed_display_name)
        .bind(seed_avatar_url)
        .execute(&mut *tx)
        .await?;

        let replacement = SessionRecord {
            id: Uuid::new_v4(),
            user_id,
            kind: UserKind::Registered,
            created_at: now_unix_seconds(),
        };
        sqlx::query(
            "insert into auth_sessions (id, user_id, kind, created_at)
             values ($1, $2, 'registered', to_timestamp($3))",
        )
        .bind(replacement.id)
        .bind(replacement.user_id)
        .bind(replacement.created_at as i64)
        .execute(&mut *tx)
        .await?;

        Self::reparent_promoted_session_data_in_tx(&mut tx, session_id, replacement.id).await?;

        let revoked = sqlx::query(
            "update auth_sessions set revoked_at = now()
             where id = $1 and revoked_at is null and expires_at > now()",
        )
        .bind(session_id)
        .execute(&mut *tx)
        .await?;
        if revoked.rows_affected() != 1 {
            return Ok(None);
        }

        if test_control
            .as_ref()
            .is_some_and(|control| control.fail_before_commit)
        {
            return Err(sqlx::Error::Protocol(
                "forced Google promotion failure".to_owned(),
            ));
        }

        tx.commit().await?;
        Ok(Some(replacement))
    }

    #[cfg(test)]
    pub(crate) async fn promote_guest_session_with_google_for_test(
        &self,
        session_id: Uuid,
        user_id: Uuid,
        provider_subject: &str,
        after_lock: std::sync::Arc<tokio::sync::Notify>,
        continue_after_lock: std::sync::Arc<tokio::sync::Notify>,
        fail_before_commit: bool,
    ) -> StoreResult<Option<SessionRecord>> {
        self.promote_guest_session_with_google_inner(
            session_id,
            user_id,
            GoogleIdentityInput {
                provider_subject,
                email: Some(format!("{provider_subject}@example.com")),
                provider_name: Some("Google User".to_owned()),
                provider_avatar_url: Some("https://example.com/google.png".to_owned()),
            },
            Some(GooglePromotionTestControl {
                after_lock,
                continue_after_lock,
                fail_before_commit,
            }),
        )
        .await
    }

    pub async fn get_session(&self, session_id: Uuid) -> StoreResult<Option<SessionRecord>> {
        let row = sqlx::query(
            "select id, user_id, kind, extract(epoch from created_at)::bigint as created_at
             from auth_sessions
             where id = $1 and revoked_at is null and expires_at > now()",
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

    pub async fn rotate_registered_session(
        &self,
        current_session_id: Uuid,
        user_id: Uuid,
    ) -> StoreResult<SessionRecord> {
        let session = SessionRecord {
            id: Uuid::new_v4(),
            user_id,
            kind: UserKind::Registered,
            created_at: now_unix_seconds(),
        };
        let mut tx = self.db.begin().await?;
        sqlx::query(
            "insert into auth_sessions (id, user_id, kind, created_at)
             values ($1, $2, 'registered', to_timestamp($3))",
        )
        .bind(session.id)
        .bind(session.user_id)
        .bind(session.created_at as i64)
        .execute(&mut *tx)
        .await?;
        sqlx::query(
            "update auth_sessions set revoked_at = now()
             where id = $1 and revoked_at is null",
        )
        .bind(current_session_id)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;

        Ok(session)
    }

    pub async fn revoke_session(&self, session_id: Uuid) -> StoreResult<bool> {
        let result = sqlx::query(
            "update auth_sessions set revoked_at = now()
             where id = $1 and revoked_at is null",
        )
        .bind(session_id)
        .execute(self.db.as_ref())
        .await?;
        Ok(result.rows_affected() > 0)
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
            .filter(|value| !value.is_empty());
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

    #[cfg(test)]
    pub(crate) async fn expire_session_for_test(&self, session_id: Uuid) -> StoreResult<()> {
        sqlx::query(
            "update auth_sessions set expires_at = now() - interval '1 second' where id = $1",
        )
        .bind(session_id)
        .execute(self.db.as_ref())
        .await?;
        Ok(())
    }

    #[cfg(test)]
    pub(crate) async fn count_sessions_for_user_for_test(&self, user_id: Uuid) -> StoreResult<i64> {
        let row =
            sqlx::query("select count(*)::bigint as count from auth_sessions where user_id = $1")
                .bind(user_id)
                .fetch_one(self.db.as_ref())
                .await?;
        Ok(row.get("count"))
    }

    async fn run_migrations(&self) -> Result<(), sqlx::Error> {
        sqlx::migrate!("./migrations").run(self.db.as_ref()).await?;
        Ok(())
    }
}

struct GooglePromotionTestControl {
    after_lock: std::sync::Arc<tokio::sync::Notify>,
    continue_after_lock: std::sync::Arc<tokio::sync::Notify>,
    fail_before_commit: bool,
}

struct GoogleIdentityInput<'a> {
    provider_subject: &'a str,
    email: Option<String>,
    provider_name: Option<String>,
    provider_avatar_url: Option<String>,
}
