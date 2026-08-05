use super::*;

impl ChatStore {
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

    pub async fn delete_pending_chat_attachment(
        &self,
        owner: OwnerScope,
        attachment_id: Uuid,
    ) -> StoreResult<bool> {
        let row = sqlx::query(
            "delete from chat_attachments
             where id = $1
               and chat_id is null
               and message_id is null
               and deleted_at is null
               and (($3::uuid is not null and owner_user_id = $3) or ($3::uuid is null and owner_session_id = $2))
             returning id",
        )
        .bind(attachment_id)
        .bind(owner.session_id)
        .bind(owner.user_id)
        .fetch_optional(self.db.as_ref())
        .await?;

        Ok(row.is_some())
    }

    pub async fn delete_stale_pending_chat_attachments(
        &self,
        kind: &str,
        stale_before_unix_seconds: u64,
        limit: i64,
    ) -> StoreResult<u64> {
        if limit <= 0 {
            return Ok(0);
        }

        let result = sqlx::query(
            "delete from chat_attachments
             where id in (
                select id
                from chat_attachments
                where kind = $1
                  and chat_id is null
                  and message_id is null
                  and deleted_at is null
                  and created_at < to_timestamp($2)
                order by created_at asc
                for update skip locked
                limit $3
             )",
        )
        .bind(kind)
        .bind(stale_before_unix_seconds as i64)
        .bind(limit)
        .execute(self.db.as_ref())
        .await?;

        Ok(result.rows_affected())
    }

    pub async fn claim_chat_attachment_file_deletions(
        &self,
        limit: i64,
    ) -> StoreResult<Vec<ChatAttachmentFileDeletionRecord>> {
        if limit <= 0 {
            return Ok(Vec::new());
        }

        let claim_token = Uuid::new_v4();
        let rows = sqlx::query(
            "with eligible as (
                select storage_key
                from chat_attachment_file_deletions
                where next_attempt_at <= now()
                  and (claim_token is null or claim_expires_at <= now())
                order by next_attempt_at, created_at, storage_key
                for update skip locked
                limit $1
             )
             update chat_attachment_file_deletions deletion
             set claim_token = $2,
                 claim_expires_at = now() + interval '15 minutes',
                 attempt_count = attempt_count + 1
             from eligible
             where deletion.storage_key = eligible.storage_key
             returning deletion.storage_key,
                       deletion.byte_size,
                       deletion.owner_session_id,
                       deletion.owner_user_id,
                       deletion.attempt_count",
        )
        .bind(limit)
        .bind(claim_token)
        .fetch_all(self.db.as_ref())
        .await?;

        Ok(rows
            .into_iter()
            .map(|row| ChatAttachmentFileDeletionRecord {
                storage_key: row.get("storage_key"),
                byte_size: row.get("byte_size"),
                owner_session_id: row.get("owner_session_id"),
                owner_user_id: row.get("owner_user_id"),
                attempt_count: row.get("attempt_count"),
                claim_token,
            })
            .collect())
    }

    pub async fn complete_chat_attachment_file_deletion(
        &self,
        storage_key: &str,
        claim_token: Uuid,
    ) -> StoreResult<bool> {
        let result = sqlx::query(
            "delete from chat_attachment_file_deletions
             where storage_key = $1 and claim_token = $2",
        )
        .bind(storage_key)
        .bind(claim_token)
        .execute(self.db.as_ref())
        .await?;

        Ok(result.rows_affected() == 1)
    }

    pub async fn retry_chat_attachment_file_deletion(
        &self,
        storage_key: &str,
        claim_token: Uuid,
    ) -> StoreResult<bool> {
        let result = sqlx::query(
            "update chat_attachment_file_deletions
             set claim_token = null,
                 claim_expires_at = null,
                 next_attempt_at = now() + interval '1 hour'
             where storage_key = $1 and claim_token = $2",
        )
        .bind(storage_key)
        .bind(claim_token)
        .execute(self.db.as_ref())
        .await?;

        Ok(result.rows_affected() == 1)
    }

    pub async fn enqueue_reconciled_chat_attachment_file_deletion(
        &self,
        storage_key: &str,
        byte_size: i64,
    ) -> StoreResult<bool> {
        let result = sqlx::query(
            "insert into chat_attachment_file_deletions (
                storage_key, byte_size, owner_session_id, owner_user_id
             )
             select $1, $2, null, null
             where not exists (
                select 1 from chat_attachments
                where storage_key = $1 and deleted_at is null
             )
             on conflict (storage_key) do nothing",
        )
        .bind(storage_key)
        .bind(byte_size)
        .execute(self.db.as_ref())
        .await?;

        Ok(result.rows_affected() == 1)
    }

    #[cfg(test)]
    pub(crate) async fn set_attachment_file_deletions_ready_for_test(
        &self,
        storage_keys: &[String],
    ) -> StoreResult<()> {
        sqlx::query(
            "update chat_attachment_file_deletions
             set next_attempt_at = '-infinity'::timestamptz,
                 claim_token = null,
                 claim_expires_at = null
             where storage_key = any($1)",
        )
        .bind(storage_keys)
        .execute(self.db.as_ref())
        .await?;
        Ok(())
    }

    #[cfg(test)]
    pub(crate) async fn count_attachment_file_deletions_for_test(
        &self,
        storage_keys: &[String],
    ) -> StoreResult<i64> {
        sqlx::query_scalar(
            "select count(*)::bigint
             from chat_attachment_file_deletions
             where storage_key = any($1)",
        )
        .bind(storage_keys)
        .fetch_one(self.db.as_ref())
        .await
    }

    #[cfg(test)]
    pub(crate) async fn count_attachment_file_deletions_for_owner_for_test(
        &self,
        owner_session_id: Uuid,
    ) -> StoreResult<i64> {
        sqlx::query_scalar(
            "select count(*)::bigint
             from chat_attachment_file_deletions
             where owner_session_id = $1",
        )
        .bind(owner_session_id)
        .fetch_one(self.db.as_ref())
        .await
    }

    #[cfg(test)]
    pub(crate) async fn delete_attachment_file_deletions_for_test(
        &self,
        storage_keys: &[String],
    ) -> StoreResult<()> {
        sqlx::query("delete from chat_attachment_file_deletions where storage_key = any($1)")
            .bind(storage_keys)
            .execute(self.db.as_ref())
            .await?;
        Ok(())
    }

    #[cfg(test)]
    pub(crate) async fn delete_attachment_file_deletions_for_owner_for_test(
        &self,
        owner_session_id: Uuid,
    ) -> StoreResult<()> {
        sqlx::query("delete from chat_attachment_file_deletions where owner_session_id = $1")
            .bind(owner_session_id)
            .execute(self.db.as_ref())
            .await?;
        Ok(())
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

    pub(super) async fn attachments_for_message(
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

#[cfg(test)]
mod tests {
    use super::*;

    fn attachment(id: Uuid, byte_size: i64) -> NewChatAttachmentRecord {
        NewChatAttachmentRecord {
            id,
            kind: "image".to_owned(),
            mime_type: "image/png".to_owned(),
            byte_size,
            width: Some(1),
            height: Some(1),
            sha256: format!("sha256-{id}"),
            storage_key: format!("chat-images/{id}.png"),
        }
    }

    async fn test_store() -> Option<ChatStore> {
        let database_url = std::env::var("WFCHAT_TEST_DATABASE_URL").ok()?;
        Some(
            ChatStore::connect(&database_url)
                .await
                .expect("WFCHAT_TEST_DATABASE_URL should identify a reachable test database"),
        )
    }

    async fn deletion_snapshot(
        store: &ChatStore,
        storage_key: &str,
    ) -> Option<(i64, Option<Uuid>, Option<Uuid>)> {
        sqlx::query_as(
            "select byte_size, owner_session_id, owner_user_id
             from chat_attachment_file_deletions
             where storage_key = $1",
        )
        .bind(storage_key)
        .fetch_optional(store.db.as_ref())
        .await
        .unwrap()
    }

    #[tokio::test]
    async fn hard_deletion_entry_points_enqueue_owner_and_byte_snapshots() {
        let Some(store) = test_store().await else {
            return;
        };
        let guest = store.create_guest_session().await.unwrap();
        let owner = OwnerScope::from_session(&guest);

        let explicit_id = Uuid::new_v4();
        let explicit = attachment(explicit_id, 11);
        let explicit_key = explicit.storage_key.clone();
        store.create_chat_attachment(owner, explicit).await.unwrap();
        assert!(store
            .delete_pending_chat_attachment(owner, explicit_id)
            .await
            .unwrap());

        let stale_id = Uuid::new_v4();
        let stale = attachment(stale_id, 12);
        let stale_key = stale.storage_key.clone();
        store.create_chat_attachment(owner, stale).await.unwrap();
        store
            .set_chat_attachment_created_at_for_test(stale_id, 1)
            .await
            .unwrap();
        assert_eq!(
            store
                .delete_stale_pending_chat_attachments("image", 2, 100)
                .await
                .unwrap(),
            1
        );

        let clear_chat = store
            .create_chat(owner, "aiko".to_owned(), "aiko_default".to_owned())
            .await
            .unwrap();
        let clear_message_id = Uuid::new_v4();
        sqlx::query(
            "insert into chat_messages (id, chat_id, role, content)
             values ($1, $2, 'user', 'clear')",
        )
        .bind(clear_message_id)
        .bind(clear_chat.id)
        .execute(store.db.as_ref())
        .await
        .unwrap();
        let clear_id = Uuid::new_v4();
        let clear_attachment = attachment(clear_id, 13);
        let clear_key = clear_attachment.storage_key.clone();
        store
            .create_chat_attachment(owner, clear_attachment)
            .await
            .unwrap();
        sqlx::query("update chat_attachments set chat_id = $1, message_id = $2 where id = $3")
            .bind(clear_chat.id)
            .bind(clear_message_id)
            .bind(clear_id)
            .execute(store.db.as_ref())
            .await
            .unwrap();
        store
            .clear_chat_messages(owner, clear_chat.id)
            .await
            .unwrap();

        let delete_chat = store
            .create_chat(owner, "aiko".to_owned(), "aiko_default".to_owned())
            .await
            .unwrap();
        let delete_id = Uuid::new_v4();
        let delete_attachment = attachment(delete_id, 14);
        let delete_key = delete_attachment.storage_key.clone();
        store
            .create_chat_attachment(owner, delete_attachment)
            .await
            .unwrap();
        sqlx::query("update chat_attachments set chat_id = $1 where id = $2")
            .bind(delete_chat.id)
            .bind(delete_id)
            .execute(store.db.as_ref())
            .await
            .unwrap();
        assert!(store.delete_chat(owner, delete_chat.id).await.unwrap());

        let cascade_id = Uuid::new_v4();
        let cascade_attachment = attachment(cascade_id, 15);
        let cascade_key = cascade_attachment.storage_key.clone();
        store
            .create_chat_attachment(owner, cascade_attachment)
            .await
            .unwrap();
        sqlx::query("delete from auth_sessions where id = $1")
            .bind(guest.id)
            .execute(store.db.as_ref())
            .await
            .unwrap();

        for (key, byte_size) in [
            (&explicit_key, 11),
            (&stale_key, 12),
            (&clear_key, 13),
            (&delete_key, 14),
            (&cascade_key, 15),
        ] {
            let snapshot = deletion_snapshot(&store, key)
                .await
                .expect("every metadata-removal path should enqueue deletion");
            assert_eq!(snapshot, (byte_size, Some(guest.id), None));
        }
        store
            .delete_attachment_file_deletions_for_test(&[
                explicit_key,
                stale_key,
                clear_key,
                delete_key,
                cascade_key,
            ])
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn deletion_claims_exclude_live_leases_expire_and_guard_updates() {
        let Some(store) = test_store().await else {
            return;
        };
        let key = format!("chat-images/{}.png", Uuid::new_v4());
        sqlx::query(
            "insert into chat_attachment_file_deletions (
                storage_key, byte_size, next_attempt_at, created_at
             ) values ($1, 21, to_timestamp(1), to_timestamp(1))",
        )
        .bind(&key)
        .execute(store.db.as_ref())
        .await
        .unwrap();

        let first = store.claim_chat_attachment_file_deletions(1).await.unwrap();
        assert_eq!(first.len(), 1);
        assert_eq!(first[0].storage_key, key);
        assert_eq!(first[0].attempt_count, 1);
        let claim_token = first[0].claim_token;

        let still_claimed: bool = sqlx::query_scalar(
            "select claim_token = $2 and claim_expires_at > now()
             from chat_attachment_file_deletions where storage_key = $1",
        )
        .bind(&key)
        .bind(claim_token)
        .fetch_one(store.db.as_ref())
        .await
        .unwrap();
        assert!(still_claimed);
        let concurrent_claim = store.claim_chat_attachment_file_deletions(1).await.unwrap();
        assert!(concurrent_claim
            .iter()
            .all(|record| record.storage_key != key));
        for record in concurrent_claim {
            store
                .retry_chat_attachment_file_deletion(&record.storage_key, record.claim_token)
                .await
                .unwrap();
        }
        assert!(!store
            .complete_chat_attachment_file_deletion(&key, Uuid::new_v4())
            .await
            .unwrap());
        assert!(!store
            .retry_chat_attachment_file_deletion(&key, Uuid::new_v4())
            .await
            .unwrap());

        sqlx::query(
            "update chat_attachment_file_deletions
             set claim_expires_at = now() - interval '1 second'
             where storage_key = $1",
        )
        .bind(&key)
        .execute(store.db.as_ref())
        .await
        .unwrap();
        let reclaimed = store.claim_chat_attachment_file_deletions(1).await.unwrap();
        assert_eq!(reclaimed.len(), 1);
        assert_eq!(reclaimed[0].storage_key, key);
        assert_ne!(reclaimed[0].claim_token, claim_token);
        assert_eq!(reclaimed[0].attempt_count, 2);

        assert!(store
            .retry_chat_attachment_file_deletion(&key, reclaimed[0].claim_token)
            .await
            .unwrap());
        let retry_is_retained: bool = sqlx::query_scalar(
            "select claim_token is null
                    and claim_expires_at is null
                    and next_attempt_at >= now() + interval '59 minutes'
             from chat_attachment_file_deletions where storage_key = $1",
        )
        .bind(&key)
        .fetch_one(store.db.as_ref())
        .await
        .unwrap();
        assert!(retry_is_retained);

        sqlx::query("delete from chat_attachment_file_deletions where storage_key = $1")
            .bind(&key)
            .execute(store.db.as_ref())
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn stale_pending_hard_deletion_is_bounded_to_one_hundred_rows() {
        let Some(store) = test_store().await else {
            return;
        };
        let guest = store.create_guest_session().await.unwrap();
        let ids = (0..101).map(|_| Uuid::new_v4()).collect::<Vec<_>>();
        let keys = ids
            .iter()
            .map(|id| format!("chat-images/{id}.png"))
            .collect::<Vec<_>>();
        sqlx::query(
            "insert into chat_attachments (
                id, owner_session_id, kind, mime_type, byte_size, sha256,
                storage_key, created_at
             )
             select id, $1, 'image', 'image/png', 1, id::text, storage_key,
                    to_timestamp(1)
             from unnest($2::uuid[], $3::text[]) batch(id, storage_key)",
        )
        .bind(guest.id)
        .bind(&ids)
        .bind(&keys)
        .execute(store.db.as_ref())
        .await
        .unwrap();

        assert_eq!(
            store
                .delete_stale_pending_chat_attachments("image", 2, 100)
                .await
                .unwrap(),
            100
        );
        let remaining: i64 =
            sqlx::query_scalar("select count(*)::bigint from chat_attachments where id = any($1)")
                .bind(&ids)
                .fetch_one(store.db.as_ref())
                .await
                .unwrap();
        assert_eq!(remaining, 1);
        assert_eq!(
            store
                .count_attachment_file_deletions_for_test(&keys)
                .await
                .unwrap(),
            100
        );

        sqlx::query("delete from auth_sessions where id = $1")
            .bind(guest.id)
            .execute(store.db.as_ref())
            .await
            .unwrap();
        store
            .delete_attachment_file_deletions_for_test(&keys)
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn promotion_reparents_durable_guest_deletions_atomically() {
        let Some(store) = test_store().await else {
            return;
        };
        let guest = store.create_guest_session().await.unwrap();
        let owner = OwnerScope::from_session(&guest);
        let attachment_id = Uuid::new_v4();
        let record = attachment(attachment_id, 31);
        let storage_key = record.storage_key.clone();
        store.create_chat_attachment(owner, record).await.unwrap();
        store
            .delete_pending_chat_attachment(owner, attachment_id)
            .await
            .unwrap();

        let user_id = Uuid::new_v4();
        let replacement = store
            .promote_guest_session_with_google(
                guest.id,
                user_id,
                &format!("attachment-promotion-{}", Uuid::new_v4()),
                None,
                None,
                None,
            )
            .await
            .unwrap()
            .expect("guest should promote");
        assert_eq!(
            deletion_snapshot(&store, &storage_key).await,
            Some((31, Some(replacement.id), Some(user_id)))
        );

        sqlx::query("delete from auth_sessions where id = $1")
            .bind(replacement.id)
            .execute(store.db.as_ref())
            .await
            .unwrap();
        assert_eq!(
            deletion_snapshot(&store, &storage_key).await,
            Some((31, Some(replacement.id), Some(user_id)))
        );
        sqlx::query("delete from chat_attachment_file_deletions where storage_key = $1")
            .bind(&storage_key)
            .execute(store.db.as_ref())
            .await
            .unwrap();
        sqlx::query("delete from user_profiles where user_id = $1")
            .bind(user_id)
            .execute(store.db.as_ref())
            .await
            .unwrap();
        sqlx::query("delete from auth_identities where user_id = $1")
            .bind(user_id)
            .execute(store.db.as_ref())
            .await
            .unwrap();
    }
}
