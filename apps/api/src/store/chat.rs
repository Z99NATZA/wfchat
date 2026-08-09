use super::*;

impl ChatStore {
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

    pub async fn list_chat_summaries(
        &self,
        owner: OwnerScope,
        character_id: &str,
    ) -> StoreResult<Vec<ChatSummaryRecord>> {
        let rows = sqlx::query(
            "select chat.id, chat.character_id,
                    coalesce((
                      select left(message.content, 256)
                      from chat_messages message
                      where message.chat_id = chat.id
                      order by message.sort_order desc
                      limit 1
                    ), '') as last_message,
                    extract(epoch from chat.created_at)::bigint as created_at,
                    extract(epoch from chat.updated_at)::bigint as updated_at
             from chats chat
             where (($3::uuid is not null and chat.owner_user_id = $3)
                    or ($3::uuid is null and chat.owner_session_id = $1))
               and chat.character_id = $2
             order by chat.updated_at desc
             limit 50",
        )
        .bind(owner.session_id)
        .bind(character_id)
        .bind(owner.user_id)
        .fetch_all(self.db.as_ref())
        .await?;

        Ok(rows
            .into_iter()
            .map(|row| ChatSummaryRecord {
                id: row.get("id"),
                character_id: row.get("character_id"),
                last_message: row.get("last_message"),
                created_at: row.get::<i64, _>("created_at") as u64,
                updated_at: row.get::<i64, _>("updated_at") as u64,
            })
            .collect())
    }

    pub async fn create_chat(
        &self,
        owner: OwnerScope,
        character_id: String,
        ai_profile_id: String,
    ) -> StoreResult<ChatRecord> {
        match self
            .create_chat_with_follow_up_limited(
                owner,
                character_id,
                ai_profile_id,
                None,
                ChatStorageLimits::default(),
            )
            .await?
        {
            CreateChatOutcome::Created(chat) => Ok(chat),
            CreateChatOutcome::FollowUpUnavailable => Err(sqlx::Error::RowNotFound),
            CreateChatOutcome::ChatLimitReached | CreateChatOutcome::MessageLimitReached => Err(
                sqlx::Error::Protocol("chat storage limit reached".to_owned()),
            ),
        }
    }

    pub async fn create_chat_with_follow_up(
        &self,
        owner: OwnerScope,
        character_id: String,
        ai_profile_id: String,
        follow_up_id: Option<Uuid>,
    ) -> StoreResult<Option<ChatRecord>> {
        match self
            .create_chat_with_follow_up_limited(
                owner,
                character_id,
                ai_profile_id,
                follow_up_id,
                ChatStorageLimits::default(),
            )
            .await?
        {
            CreateChatOutcome::Created(chat) => Ok(Some(chat)),
            CreateChatOutcome::FollowUpUnavailable
            | CreateChatOutcome::ChatLimitReached
            | CreateChatOutcome::MessageLimitReached => Ok(None),
        }
    }

    pub async fn create_chat_with_follow_up_limited(
        &self,
        owner: OwnerScope,
        character_id: String,
        ai_profile_id: String,
        follow_up_id: Option<Uuid>,
        limits: ChatStorageLimits,
    ) -> StoreResult<CreateChatOutcome> {
        let mut tx = self.db.begin().await?;
        let owner_lock_key = owner
            .user_id
            .map(|user_id| format!("user:{user_id}"))
            .unwrap_or_else(|| format!("session:{}", owner.session_id));
        sqlx::query("select pg_advisory_xact_lock(hashtextextended($1, 0))")
            .bind(owner_lock_key)
            .execute(&mut *tx)
            .await?;
        let chat_count: i64 = sqlx::query_scalar(
            "select count(*)::bigint
             from chats
             where (($2::uuid is not null and owner_user_id = $2)
                    or ($2::uuid is null and owner_session_id = $1))",
        )
        .bind(owner.session_id)
        .bind(owner.user_id)
        .fetch_one(&mut *tx)
        .await?;
        if usize::try_from(chat_count)
            .ok()
            .is_none_or(|count| count >= limits.max_chats_per_owner)
        {
            tx.rollback().await?;
            return Ok(CreateChatOutcome::ChatLimitReached);
        }
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
        .execute(&mut *tx)
        .await?;

        if let Some(follow_up_id) = follow_up_id {
            let row = sqlx::query(
                "select prompt, extract(epoch from shown_at)::bigint as shown_at
                 from memory_follow_up_deliveries
                 where id = $1
                   and (($4::uuid is not null and owner_user_id = $4)
                        or ($4::uuid is null and owner_session_id = $2))
                   and character_id = $3
                   and chat_id is null
                 for update",
            )
            .bind(follow_up_id)
            .bind(owner.session_id)
            .bind(&character_id)
            .bind(owner.user_id)
            .fetch_optional(&mut *tx)
            .await?;
            let Some(row) = row else {
                tx.rollback().await?;
                return Ok(CreateChatOutcome::FollowUpUnavailable);
            };
            let prompt: String = row.get("prompt");
            if limits.max_messages_per_chat < 1
                || prompt.chars().count() > limits.max_stored_chars_per_chat
            {
                tx.rollback().await?;
                return Ok(CreateChatOutcome::MessageLimitReached);
            }
            let shown_at: i64 = row.get("shown_at");
            sqlx::query(
                "insert into chat_messages (id, chat_id, role, content, created_at)
                 values ($1, $2, 'assistant', $3, to_timestamp($4))",
            )
            .bind(Uuid::new_v4())
            .bind(id)
            .bind(prompt)
            .bind(shown_at)
            .execute(&mut *tx)
            .await?;
            sqlx::query("update memory_follow_up_deliveries set chat_id = $1 where id = $2")
                .bind(id)
                .bind(follow_up_id)
                .execute(&mut *tx)
                .await?;
        }

        tx.commit().await?;
        self.get_chat(owner, id)
            .await?
            .map(CreateChatOutcome::Created)
            .ok_or(sqlx::Error::RowNotFound)
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
        self.append_chat_messages_with_attachments_and_timezone(
            owner,
            chat_id,
            user_message,
            assistant_message,
            attachment_ids,
            "UTC",
        )
        .await
    }

    pub async fn append_chat_messages_with_attachments_and_timezone(
        &self,
        owner: OwnerScope,
        chat_id: Uuid,
        user_message: StoredMessage,
        assistant_message: StoredMessage,
        attachment_ids: &[Uuid],
        user_timezone: &str,
    ) -> StoreResult<Option<ChatRecord>> {
        match self
            .append_chat_messages_limited(
                owner,
                chat_id,
                user_message,
                assistant_message,
                attachment_ids,
                user_timezone,
                ChatStorageLimits::default(),
            )
            .await?
        {
            AppendChatMessagesOutcome::Appended { .. } => self.get_chat(owner, chat_id).await,
            AppendChatMessagesOutcome::Unavailable => Ok(None),
            AppendChatMessagesOutcome::LimitReached => Err(sqlx::Error::Protocol(
                "chat message storage limit reached".to_owned(),
            )),
        }
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn append_chat_messages_limited(
        &self,
        owner: OwnerScope,
        chat_id: Uuid,
        user_message: StoredMessage,
        assistant_message: StoredMessage,
        attachment_ids: &[Uuid],
        user_timezone: &str,
        limits: ChatStorageLimits,
    ) -> StoreResult<AppendChatMessagesOutcome> {
        self.append_chat_messages_limited_with_quota(
            owner,
            chat_id,
            user_message,
            assistant_message,
            attachment_ids,
            user_timezone,
            limits,
            None,
        )
        .await
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn append_chat_messages_limited_with_quota(
        &self,
        owner: OwnerScope,
        chat_id: Uuid,
        mut user_message: StoredMessage,
        assistant_message: StoredMessage,
        attachment_ids: &[Uuid],
        user_timezone: &str,
        limits: ChatStorageLimits,
        quota_reservation_id: Option<Uuid>,
    ) -> StoreResult<AppendChatMessagesOutcome> {
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
            return Ok(AppendChatMessagesOutcome::Unavailable);
        }

        let row = sqlx::query(
            "select count(*)::bigint as message_count,
                    coalesce(sum(char_length(content)), 0)::bigint as stored_chars
             from chat_messages
             where chat_id = $1",
        )
        .bind(chat_id)
        .fetch_one(&mut *tx)
        .await?;
        let message_count: i64 = row.get("message_count");
        let stored_chars: i64 = row.get("stored_chars");
        let incoming_chars = user_message
            .content
            .chars()
            .count()
            .checked_add(assistant_message.content.chars().count());
        let message_limit_reached = usize::try_from(message_count)
            .ok()
            .and_then(|count| count.checked_add(2))
            .is_none_or(|next| next > limits.max_messages_per_chat);
        let char_limit_reached = usize::try_from(stored_chars)
            .ok()
            .and_then(|stored| incoming_chars.and_then(|incoming| stored.checked_add(incoming)))
            .is_none_or(|next| next > limits.max_stored_chars_per_chat);
        if message_limit_reached || char_limit_reached {
            tx.rollback().await?;
            return Ok(AppendChatMessagesOutcome::LimitReached);
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

        sqlx::query(
            "insert into memory_extraction_jobs (
                id, chat_id, user_message_id, assistant_message_id,
                owner_session_id, owner_user_id, character_id, user_timezone
             )
             select $1, chat.id, $2, $3, chat.owner_session_id,
                    chat.owner_user_id, chat.character_id, $5
             from chats chat
             where chat.id = $4
             on conflict (user_message_id) do nothing",
        )
        .bind(Uuid::new_v4())
        .bind(user_message.id)
        .bind(assistant_message.id)
        .bind(chat_id)
        .bind(user_timezone)
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
                return Ok(AppendChatMessagesOutcome::Unavailable);
            }
        }

        sqlx::query("update chats set updated_at = now() where id = $1")
            .bind(chat_id)
            .execute(&mut *tx)
            .await?;

        if let Some(reservation_id) = quota_reservation_id {
            let finalized = sqlx::query(
                "update chat_generation_quota_reservations
                 set owner_state = 'committed', committed_at = now(), updated_at = now()
                 where id = $1 and owner_state = 'reserved' and global_state = 'consumed'",
            )
            .bind(reservation_id)
            .execute(&mut *tx)
            .await?;
            if finalized.rows_affected() != 1 {
                return Err(sqlx::Error::Protocol(
                    "chat quota reservation could not be finalized".to_owned(),
                ));
            }
        }

        tx.commit().await?;
        user_message.attachments = self.attachments_for_message(user_message.id).await?;

        Ok(AppendChatMessagesOutcome::Appended {
            user_message,
            assistant_message,
        })
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
}
