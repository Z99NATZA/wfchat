use super::*;

impl ChatStore {
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

    pub async fn find_memory_retrieval_candidates(
        &self,
        owner: OwnerScope,
        character_id: &str,
        topic_signals: &[String],
        limit: i64,
    ) -> StoreResult<Vec<MemoryRetrievalRecord>> {
        if topic_signals.is_empty() || limit <= 0 {
            return Ok(Vec::new());
        }

        let rows = sqlx::query(
            "select item.id, item.memory_key, item.kind, item.content, item.tags,
                    item.confidence, item.importance,
                    extract(epoch from item.last_reinforced_at)::bigint as last_reinforced_at,
                    extract(epoch from item.expires_at)::bigint as expires_at,
                    extract(epoch from item.updated_at)::bigint as updated_at,
                    count(source.id)::bigint as source_count
             from memory_items item
             left join memory_sources source on source.memory_id = item.id
             where (($3::uuid is not null and item.owner_user_id = $3)
                    or ($3::uuid is null and item.owner_session_id = $1))
               and item.character_id = $2
               and item.confidence >= 0.65
               and item.kind = any($4::text[])
               and (item.expires_at is null or item.expires_at > now())
               and (
                 item.tags && $5::text[]
                 or exists (
                   select 1 from unnest($5::text[]) signal
                   where item.memory_key ilike ('%' || signal || '%')
                      or item.content ilike ('%' || signal || '%')
                 )
               )
             group by item.id
             order by item.confidence desc, item.importance desc,
                      item.last_reinforced_at desc, item.memory_key, item.id
             limit $6",
        )
        .bind(owner.session_id)
        .bind(character_id)
        .bind(owner.user_id)
        .bind(vec![
            "preference",
            "profile",
            "goal",
            "constraint",
            "plan",
            "experience",
        ])
        .bind(topic_signals)
        .bind(limit.min(100))
        .fetch_all(self.db.as_ref())
        .await?;

        Ok(rows.into_iter().map(memory_retrieval_from_row).collect())
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

        recalculate_memory_evidence(&mut tx, &[memory_id]).await?;

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
        let mut tx = self.db.begin().await?;
        sqlx::query(
            "delete from memory_extraction_jobs
             where (($2::uuid is not null and owner_user_id = $2)
                    or ($2::uuid is null and owner_session_id = $1))",
        )
        .bind(owner.session_id)
        .bind(owner.user_id)
        .execute(&mut *tx)
        .await?;
        let result = sqlx::query(
            "delete from memory_items
             where (($2::uuid is not null and owner_user_id = $2) or ($2::uuid is null and owner_session_id = $1))",
        )
        .bind(owner.session_id)
        .bind(owner.user_id)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
        Ok(result.rows_affected())
    }

    pub async fn claim_memory_extraction_job(
        &self,
    ) -> StoreResult<Option<MemoryExtractionJobRecord>> {
        self.claim_memory_extraction_job_for_message(None).await
    }

    async fn claim_memory_extraction_job_for_message(
        &self,
        user_message_id: Option<Uuid>,
    ) -> StoreResult<Option<MemoryExtractionJobRecord>> {
        let row = sqlx::query(
            "with candidate as (
                select id
                from memory_extraction_jobs
                where ($1::uuid is null or user_message_id = $1)
                  and attempts < max_attempts
                  and (
                    (status in ('pending', 'retry') and available_at <= now())
                    or (status = 'processing' and locked_at < now() - interval '5 minutes')
                  )
                order by available_at, created_at
                for update skip locked
                limit 1
             ), claimed as (
                update memory_extraction_jobs job
                set status = 'processing', attempts = job.attempts + 1,
                    locked_at = now(), last_error_code = null, updated_at = now()
                from candidate
                where job.id = candidate.id
                returning job.*
             )
             select claimed.id, claimed.chat_id, claimed.user_message_id,
                    claimed.assistant_message_id, claimed.owner_session_id,
                    claimed.owner_user_id, claimed.character_id, claimed.status,
                    claimed.attempts, claimed.max_attempts, message.content as user_content
             from claimed
             join chat_messages message on message.id = claimed.user_message_id",
        )
        .bind(user_message_id)
        .fetch_optional(self.db.as_ref())
        .await?;

        Ok(row.map(memory_extraction_job_from_row))
    }

    #[cfg(test)]
    pub(crate) async fn claim_memory_extraction_job_for_test(
        &self,
        user_message_id: Uuid,
    ) -> StoreResult<Option<MemoryExtractionJobRecord>> {
        self.claim_memory_extraction_job_for_message(Some(user_message_id))
            .await
    }

    #[cfg(test)]
    pub async fn complete_memory_extraction_job(&self, job_id: Uuid) -> StoreResult<bool> {
        let result = sqlx::query(
            "update memory_extraction_jobs
             set status = 'completed', locked_at = null, last_error_code = null, updated_at = now()
             where id = $1 and status = 'processing'",
        )
        .bind(job_id)
        .execute(self.db.as_ref())
        .await?;
        Ok(result.rows_affected() == 1)
    }

    pub async fn fail_memory_extraction_job(
        &self,
        job_id: Uuid,
        error_code: &str,
    ) -> StoreResult<Option<String>> {
        let row = sqlx::query(
            "update memory_extraction_jobs
             set status = case when attempts >= max_attempts then 'dead' else 'retry' end,
                 available_at = case
                    when attempts >= max_attempts then available_at
                    else now() + make_interval(secs => least(60, (2 ^ attempts)::integer))
                 end,
                 locked_at = null,
                 last_error_code = $2,
                 updated_at = now()
             where id = $1 and status = 'processing'
             returning status",
        )
        .bind(job_id)
        .bind(error_code)
        .fetch_optional(self.db.as_ref())
        .await?;
        Ok(row.map(|row| row.get("status")))
    }

    pub async fn apply_memory_capture(
        &self,
        job_id: Uuid,
        candidates: &[CapturedMemoryRecord],
    ) -> StoreResult<bool> {
        let mut tx = self.db.begin().await?;
        let job = sqlx::query(
            "select job.chat_id, job.user_message_id, chat.owner_session_id,
                    chat.owner_user_id, chat.character_id
             from memory_extraction_jobs job
             join chats chat on chat.id = job.chat_id
             join chat_messages message
               on message.id = job.user_message_id
              and message.chat_id = job.chat_id
              and message.role = 'user'
             where job.id = $1 and job.status = 'processing'
             for update of job",
        )
        .bind(job_id)
        .fetch_optional(&mut *tx)
        .await?;
        let Some(job) = job else {
            return Ok(false);
        };
        let chat_id: Uuid = job.get("chat_id");
        let message_id: Uuid = job.get("user_message_id");
        let owner_session_id: Uuid = job.get("owner_session_id");
        let owner_user_id: Option<Uuid> = job.get("owner_user_id");
        let character_id: String = job.get("character_id");

        for candidate in candidates {
            let existing = if owner_user_id.is_some() {
                sqlx::query(
                    "select id, content from memory_items
                     where owner_user_id = $1 and character_id = $2 and memory_key = $3
                     for update",
                )
                .bind(owner_user_id)
                .bind(&character_id)
                .bind(&candidate.memory_key)
                .fetch_optional(&mut *tx)
                .await?
            } else {
                sqlx::query(
                    "select id, content from memory_items
                     where owner_user_id is null and owner_session_id = $1
                       and character_id = $2 and memory_key = $3
                     for update",
                )
                .bind(owner_session_id)
                .bind(&character_id)
                .bind(&candidate.memory_key)
                .fetch_optional(&mut *tx)
                .await?
            };

            let memory_id = match existing {
                Some(row) => {
                    let memory_id: Uuid = row.get("id");
                    let old_content: String = row.get("content");
                    if old_content != candidate.content {
                        if !candidate.replaces_existing {
                            continue;
                        }
                        sqlx::query("delete from memory_sources where memory_id = $1")
                            .bind(memory_id)
                            .execute(&mut *tx)
                            .await?;
                    }
                    sqlx::query(
                        "update memory_items
                         set kind = $2, content = $3, tags = $4, importance = $5,
                             expires_at = null, updated_at = now()
                         where id = $1",
                    )
                    .bind(memory_id)
                    .bind(&candidate.kind)
                    .bind(&candidate.content)
                    .bind(&candidate.tags)
                    .bind(candidate.importance as f64)
                    .execute(&mut *tx)
                    .await?;
                    memory_id
                }
                None => {
                    let memory_id = Uuid::new_v4();
                    sqlx::query(
                        "insert into memory_items (
                            id, owner_session_id, owner_user_id, character_id,
                            memory_key, kind, content, tags, confidence, importance
                         ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
                    )
                    .bind(memory_id)
                    .bind(owner_session_id)
                    .bind(owner_user_id)
                    .bind(&character_id)
                    .bind(&candidate.memory_key)
                    .bind(&candidate.kind)
                    .bind(&candidate.content)
                    .bind(&candidate.tags)
                    .bind(candidate.evidence_strength as f64)
                    .bind(candidate.importance as f64)
                    .execute(&mut *tx)
                    .await?;
                    memory_id
                }
            };

            sqlx::query(
                "insert into memory_sources (
                    id, memory_id, chat_id, message_id, evidence_strength
                 ) values ($1, $2, $3, $4, $5)
                 on conflict (memory_id, message_id) where message_id is not null
                 do update set evidence_strength = greatest(
                    memory_sources.evidence_strength, excluded.evidence_strength
                 )",
            )
            .bind(Uuid::new_v4())
            .bind(memory_id)
            .bind(chat_id)
            .bind(message_id)
            .bind(candidate.evidence_strength as f64)
            .execute(&mut *tx)
            .await?;

            recalculate_memory_evidence(&mut tx, &[memory_id]).await?;
        }

        sqlx::query(
            "update memory_extraction_jobs
             set status = 'completed', locked_at = null, last_error_code = null, updated_at = now()
             where id = $1",
        )
        .bind(job_id)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
        Ok(true)
    }
}

pub(super) async fn cleanup_memory_after_source_removal(
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

    recalculate_memory_evidence(tx, affected_memory_ids).await?;

    Ok(())
}

pub(super) async fn recalculate_memory_evidence(
    tx: &mut Transaction<'_, Postgres>,
    memory_ids: &[Uuid],
) -> StoreResult<()> {
    if memory_ids.is_empty() {
        return Ok(());
    }

    sqlx::query(
        "update memory_items item
         set confidence = least(
               0.99,
               evidence.max_strength
                 + greatest(0, evidence.source_count - 1)::double precision * 0.05
             ),
             last_reinforced_at = evidence.last_reinforced_at,
             updated_at = now()
         from (
           select memory_id, max(evidence_strength) as max_strength,
                  count(*) as source_count, max(created_at) as last_reinforced_at
           from memory_sources
           where memory_id = any($1)
           group by memory_id
         ) evidence
         where item.id = evidence.memory_id",
    )
    .bind(memory_ids)
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

fn memory_retrieval_from_row(row: sqlx::postgres::PgRow) -> MemoryRetrievalRecord {
    MemoryRetrievalRecord {
        id: row.get("id"),
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
        updated_at: row.get::<i64, _>("updated_at") as u64,
        source_count: row.get::<i64, _>("source_count") as u32,
    }
}

fn memory_extraction_job_from_row(row: sqlx::postgres::PgRow) -> MemoryExtractionJobRecord {
    MemoryExtractionJobRecord {
        id: row.get("id"),
        chat_id: row.get("chat_id"),
        user_message_id: row.get("user_message_id"),
        assistant_message_id: row.get("assistant_message_id"),
        owner_session_id: row.get("owner_session_id"),
        owner_user_id: row.get("owner_user_id"),
        character_id: row.get("character_id"),
        status: row.get("status"),
        attempts: row.get("attempts"),
        max_attempts: row.get("max_attempts"),
        user_content: row.get("user_content"),
    }
}
