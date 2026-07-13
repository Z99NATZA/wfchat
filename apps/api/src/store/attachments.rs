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
