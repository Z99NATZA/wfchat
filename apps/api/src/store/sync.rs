use super::*;

impl ChatStore {
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
}
