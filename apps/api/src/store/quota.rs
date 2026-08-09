use std::collections::HashMap;

use super::*;

const STALE_RECOVERY_BATCH_SIZE: i64 = 500;
const RETENTION_CLEANUP_BATCH_SIZE: i64 = 500;

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
struct QuotaRetentionCleanupCounts {
    reservations: i64,
    owner_counters: i64,
    global_counters: i64,
}

#[cfg(test)]
static DAILY_CHAT_QUOTA_TEST_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

#[cfg(test)]
#[must_use = "the isolation guard must be held for the complete quota test"]
pub(crate) struct DailyChatQuotaTestIsolation {
    store: ChatStore,
    _guard: tokio::sync::MutexGuard<'static, ()>,
}

#[cfg(test)]
impl DailyChatQuotaTestIsolation {
    pub(crate) async fn finish(self) -> StoreResult<()> {
        self.store.clear_chat_generation_quotas_for_test().await
    }
}

#[derive(Clone, Debug, Eq, Hash, PartialEq)]
struct QuotaOwnerKey {
    kind: String,
    id: Uuid,
}

impl ChatStore {
    #[cfg(test)]
    pub(crate) async fn isolate_daily_chat_quota_test(
        &self,
    ) -> StoreResult<DailyChatQuotaTestIsolation> {
        let guard = DAILY_CHAT_QUOTA_TEST_LOCK.lock().await;
        self.clear_chat_generation_quotas_for_test().await?;
        Ok(DailyChatQuotaTestIsolation {
            store: self.clone(),
            _guard: guard,
        })
    }

    #[cfg(test)]
    async fn clear_chat_generation_quotas_for_test(&self) -> StoreResult<()> {
        let mut tx = self.db.begin().await?;
        sqlx::query("delete from chat_generation_quota_reservations")
            .execute(&mut *tx)
            .await?;
        sqlx::query("delete from chat_daily_owner_quotas")
            .execute(&mut *tx)
            .await?;
        sqlx::query("delete from chat_daily_global_quotas")
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
        Ok(())
    }

    pub async fn reserve_chat_generation_quota(
        &self,
        session_id: Uuid,
        chat_id: Uuid,
        registered_limit: u32,
        guest_limit: u32,
        global_limit: u32,
        stale_after_seconds: u64,
    ) -> StoreResult<ChatGenerationQuotaAdmission> {
        let mut tx = self.db.begin().await?;
        let session = sqlx::query(
            "select user_id, kind, quota_carryover_user_id,
                    quota_carryover_date = (now() at time zone 'Asia/Bangkok')::date
                      as quota_carryover_active,
                    ((now() at time zone 'Asia/Bangkok')::date)::text as quota_date
             from auth_sessions
             where id = $1 and revoked_at is null and expires_at > now()
             for update",
        )
        .bind(session_id)
        .fetch_optional(&mut *tx)
        .await?;
        let Some(session) = session else {
            tx.rollback().await?;
            return Ok(ChatGenerationQuotaAdmission::SessionUnavailable);
        };
        Self::recover_stale_chat_generation_quotas_in_tx(&mut tx, stale_after_seconds).await?;
        Self::cleanup_past_chat_generation_quotas_in_tx(&mut tx).await?;

        let user_id: Uuid = session.get("user_id");
        let session_kind: String = session.get("kind");
        let carryover_user_id: Option<Uuid> = session.get("quota_carryover_user_id");
        let carryover_active: Option<bool> = session.get("quota_carryover_active");
        let quota_date: String = session.get("quota_date");
        let (owner, owner_limit) = if matches!(session_kind.as_str(), "registered" | "admin") {
            (
                QuotaOwnerKey {
                    kind: "account".to_owned(),
                    id: user_id,
                },
                registered_limit,
            )
        } else if carryover_active == Some(true) {
            match carryover_user_id {
                Some(owner_id) => (
                    QuotaOwnerKey {
                        kind: "account".to_owned(),
                        id: owner_id,
                    },
                    registered_limit,
                ),
                None => (
                    QuotaOwnerKey {
                        kind: "guest".to_owned(),
                        id: session_id,
                    },
                    guest_limit,
                ),
            }
        } else {
            (
                QuotaOwnerKey {
                    kind: "guest".to_owned(),
                    id: session_id,
                },
                guest_limit,
            )
        };

        let owner_admitted = sqlx::query_scalar::<_, i32>(
            "insert into chat_daily_owner_quotas
               (quota_date, owner_kind, owner_id, usage_count, updated_at)
             values ($1::date, $2, $3, 1, now())
             on conflict (quota_date, owner_kind, owner_id)
             do update set usage_count = chat_daily_owner_quotas.usage_count + 1,
                           updated_at = now()
             where chat_daily_owner_quotas.usage_count < $4
             returning usage_count",
        )
        .bind(&quota_date)
        .bind(&owner.kind)
        .bind(owner.id)
        .bind(i64::from(owner_limit))
        .fetch_optional(&mut *tx)
        .await?
        .is_some();
        if !owner_admitted {
            let retry_after_seconds =
                Self::retry_after_bangkok_midnight_in_tx(&mut tx, &quota_date).await?;
            tx.rollback().await?;
            return Ok(ChatGenerationQuotaAdmission::OwnerLimitReached {
                retry_after_seconds,
            });
        }

        let global_admitted = sqlx::query_scalar::<_, i32>(
            "insert into chat_daily_global_quotas
               (quota_date, reserved_count, consumed_count, updated_at)
             values ($1::date, 1, 0, now())
             on conflict (quota_date)
             do update set reserved_count = chat_daily_global_quotas.reserved_count + 1,
                           updated_at = now()
             where chat_daily_global_quotas.reserved_count
                     + chat_daily_global_quotas.consumed_count < $2
             returning reserved_count",
        )
        .bind(&quota_date)
        .bind(i64::from(global_limit))
        .fetch_optional(&mut *tx)
        .await?
        .is_some();
        if !global_admitted {
            let retry_after_seconds =
                Self::retry_after_bangkok_midnight_in_tx(&mut tx, &quota_date).await?;
            tx.rollback().await?;
            return Ok(ChatGenerationQuotaAdmission::GlobalLimitReached {
                retry_after_seconds,
            });
        }

        let reservation = ChatGenerationQuotaReservation { id: Uuid::new_v4() };
        sqlx::query(
            "insert into chat_generation_quota_reservations
               (id, quota_date, request_session_id, chat_id, owner_kind, owner_id)
             values ($1, $2::date, $3, $4, $5, $6)",
        )
        .bind(reservation.id)
        .bind(&quota_date)
        .bind(session_id)
        .bind(chat_id)
        .bind(&owner.kind)
        .bind(owner.id)
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;
        Ok(ChatGenerationQuotaAdmission::Admitted(reservation))
    }

    pub async fn mark_chat_generation_provider_started(
        &self,
        reservation_id: Uuid,
    ) -> StoreResult<bool> {
        let mut tx = self.db.begin().await?;
        let row = sqlx::query(
            "select quota_date::text as quota_date, global_state
             from chat_generation_quota_reservations
             where id = $1
             for update",
        )
        .bind(reservation_id)
        .fetch_optional(&mut *tx)
        .await?;
        let Some(row) = row else {
            tx.rollback().await?;
            return Ok(false);
        };
        let global_state: String = row.get("global_state");
        if global_state == "consumed" {
            tx.commit().await?;
            return Ok(true);
        }
        if global_state != "reserved" {
            tx.rollback().await?;
            return Ok(false);
        }

        let quota_date: String = row.get("quota_date");
        let updated = sqlx::query(
            "update chat_daily_global_quotas
             set reserved_count = reserved_count - 1,
                 consumed_count = consumed_count + 1,
                 updated_at = now()
             where quota_date = $1::date and reserved_count > 0",
        )
        .bind(&quota_date)
        .execute(&mut *tx)
        .await?;
        if updated.rows_affected() != 1 {
            return Err(sqlx::Error::Protocol(
                "global chat quota reservation counter is inconsistent".to_owned(),
            ));
        }
        sqlx::query(
            "update chat_generation_quota_reservations
             set global_state = 'consumed', provider_started_at = now(), updated_at = now()
             where id = $1 and global_state = 'reserved'",
        )
        .bind(reservation_id)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
        Ok(true)
    }

    pub async fn release_chat_generation_quota(&self, reservation_id: Uuid) -> StoreResult<()> {
        let mut tx = self.db.begin().await?;
        let row = sqlx::query(
            "select quota_date::text as quota_date, owner_kind, owner_id,
                    owner_state, global_state
             from chat_generation_quota_reservations
             where id = $1
             for update",
        )
        .bind(reservation_id)
        .fetch_optional(&mut *tx)
        .await?;
        let Some(row) = row else {
            tx.rollback().await?;
            return Ok(());
        };

        let quota_date: String = row.get("quota_date");
        let owner_state: String = row.get("owner_state");
        let global_state: String = row.get("global_state");
        if owner_state == "reserved" {
            let owner = QuotaOwnerKey {
                kind: row.get("owner_kind"),
                id: row.get("owner_id"),
            };
            Self::decrement_owner_quota_in_tx(&mut tx, &quota_date, &owner, 1).await?;
        }
        if global_state == "reserved" {
            Self::decrement_global_reserved_quota_in_tx(&mut tx, &quota_date).await?;
        }

        sqlx::query(
            "update chat_generation_quota_reservations
             set owner_state = case when owner_state = 'reserved' then 'released' else owner_state end,
                 global_state = case when global_state = 'reserved' then 'released' else global_state end,
                 released_at = case
                   when owner_state = 'reserved' or global_state = 'reserved' then now()
                   else released_at
                 end,
                 updated_at = case
                   when owner_state = 'reserved' or global_state = 'reserved' then now()
                   else updated_at
                 end
             where id = $1",
        )
        .bind(reservation_id)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
        Ok(())
    }

    pub(super) async fn transfer_session_daily_quota_to_account_in_tx(
        tx: &mut Transaction<'_, Postgres>,
        session_id: Uuid,
        user_id: Uuid,
    ) -> StoreResult<()> {
        let rows = sqlx::query(
            "select owner_kind, owner_id
             from chat_generation_quota_reservations
             where request_session_id = $1
               and quota_date = (now() at time zone 'Asia/Bangkok')::date
               and owner_state in ('reserved', 'committed')
             for update",
        )
        .bind(session_id)
        .fetch_all(&mut **tx)
        .await?;
        if rows.is_empty() {
            return Ok(());
        }

        let target = QuotaOwnerKey {
            kind: "account".to_owned(),
            id: user_id,
        };
        let mut source_counts = HashMap::<QuotaOwnerKey, i64>::new();
        for row in rows {
            let source = QuotaOwnerKey {
                kind: row.get("owner_kind"),
                id: row.get("owner_id"),
            };
            if source != target {
                *source_counts.entry(source).or_default() += 1;
            }
        }
        let transferred_count = source_counts.values().sum::<i64>();
        if transferred_count == 0 {
            return Ok(());
        }
        let quota_date = Self::bangkok_quota_date_in_tx(tx).await?;
        for (source, count) in &source_counts {
            Self::decrement_owner_quota_in_tx(tx, &quota_date, source, *count).await?;
        }
        sqlx::query(
            "insert into chat_daily_owner_quotas
               (quota_date, owner_kind, owner_id, usage_count, updated_at)
             values ($1::date, 'account', $2, $3, now())
             on conflict (quota_date, owner_kind, owner_id)
             do update set usage_count = chat_daily_owner_quotas.usage_count + excluded.usage_count,
                           updated_at = now()",
        )
        .bind(&quota_date)
        .bind(user_id)
        .bind(transferred_count)
        .execute(&mut **tx)
        .await?;
        sqlx::query(
            "update chat_generation_quota_reservations
             set owner_kind = 'account', owner_id = $2, updated_at = now()
             where request_session_id = $1
               and quota_date = $3::date
               and owner_state in ('reserved', 'committed')
               and (owner_kind <> 'account' or owner_id <> $2)",
        )
        .bind(session_id)
        .bind(user_id)
        .bind(&quota_date)
        .execute(&mut **tx)
        .await?;
        Ok(())
    }

    async fn recover_stale_chat_generation_quotas_in_tx(
        tx: &mut Transaction<'_, Postgres>,
        stale_after_seconds: u64,
    ) -> StoreResult<()> {
        let stale_after_seconds = i64::try_from(stale_after_seconds).map_err(|_| {
            sqlx::Error::Protocol("chat quota stale interval is too large".to_owned())
        })?;
        loop {
            let rows = sqlx::query(
                "select id, quota_date::text as quota_date, owner_kind, owner_id,
                        owner_state, global_state
                 from chat_generation_quota_reservations
                 where updated_at < now() - make_interval(secs => $1)
                   and (owner_state = 'reserved' or global_state = 'reserved')
                 order by updated_at, id
                 limit $2
                 for update skip locked",
            )
            .bind(stale_after_seconds)
            .bind(STALE_RECOVERY_BATCH_SIZE)
            .fetch_all(&mut **tx)
            .await?;
            let row_count = rows.len();
            for row in rows {
                let quota_date: String = row.get("quota_date");
                let owner_state: String = row.get("owner_state");
                let global_state: String = row.get("global_state");
                if owner_state == "reserved" {
                    let owner = QuotaOwnerKey {
                        kind: row.get("owner_kind"),
                        id: row.get("owner_id"),
                    };
                    Self::decrement_owner_quota_in_tx(tx, &quota_date, &owner, 1).await?;
                }
                if global_state == "reserved" {
                    Self::decrement_global_reserved_quota_in_tx(tx, &quota_date).await?;
                }
                sqlx::query(
                    "update chat_generation_quota_reservations
                     set owner_state = case when owner_state = 'reserved' then 'released' else owner_state end,
                         global_state = case when global_state = 'reserved' then 'released' else global_state end,
                         released_at = now(), updated_at = now()
                     where id = $1",
                )
                .bind(row.get::<Uuid, _>("id"))
                .execute(&mut **tx)
                .await?;
            }
            if row_count < STALE_RECOVERY_BATCH_SIZE as usize {
                break;
            }
        }
        Ok(())
    }

    async fn cleanup_past_chat_generation_quotas_in_tx(
        tx: &mut Transaction<'_, Postgres>,
    ) -> StoreResult<QuotaRetentionCleanupCounts> {
        let reservations = sqlx::query_scalar::<_, i64>(
            "with candidates as (
               select id
               from chat_generation_quota_reservations
               where quota_date < (now() at time zone 'Asia/Bangkok')::date
                 and owner_state <> 'reserved'
                 and global_state <> 'reserved'
               order by quota_date, id
               limit $1
               for update skip locked
             ), deleted as (
               delete from chat_generation_quota_reservations as reservation
               using candidates
               where reservation.id = candidates.id
               returning 1
             )
             select count(*)::bigint from deleted",
        )
        .bind(RETENTION_CLEANUP_BATCH_SIZE)
        .fetch_one(&mut **tx)
        .await?;

        let owner_counters = sqlx::query_scalar::<_, i64>(
            "with candidates as (
               select quota.quota_date, quota.owner_kind, quota.owner_id
               from chat_daily_owner_quotas as quota
               where quota.quota_date < (now() at time zone 'Asia/Bangkok')::date
                 and not exists (
                   select 1
                   from chat_generation_quota_reservations as reservation
                   where reservation.quota_date = quota.quota_date
                     and reservation.owner_kind = quota.owner_kind
                     and reservation.owner_id = quota.owner_id
                     and reservation.owner_state = 'reserved'
                 )
               order by quota.quota_date, quota.owner_kind, quota.owner_id
               limit $1
               for update skip locked
             ), deleted as (
               delete from chat_daily_owner_quotas as quota
               using candidates
               where quota.quota_date = candidates.quota_date
                 and quota.owner_kind = candidates.owner_kind
                 and quota.owner_id = candidates.owner_id
               returning 1
             )
             select count(*)::bigint from deleted",
        )
        .bind(RETENTION_CLEANUP_BATCH_SIZE)
        .fetch_one(&mut **tx)
        .await?;

        let global_counters = sqlx::query_scalar::<_, i64>(
            "with candidates as (
               select quota.quota_date
               from chat_daily_global_quotas as quota
               where quota.quota_date < (now() at time zone 'Asia/Bangkok')::date
                 and not exists (
                   select 1
                   from chat_generation_quota_reservations as reservation
                   where reservation.quota_date = quota.quota_date
                     and reservation.global_state = 'reserved'
                 )
               order by quota.quota_date
               limit $1
               for update skip locked
             ), deleted as (
               delete from chat_daily_global_quotas as quota
               using candidates
               where quota.quota_date = candidates.quota_date
               returning 1
             )
             select count(*)::bigint from deleted",
        )
        .bind(RETENTION_CLEANUP_BATCH_SIZE)
        .fetch_one(&mut **tx)
        .await?;

        Ok(QuotaRetentionCleanupCounts {
            reservations,
            owner_counters,
            global_counters,
        })
    }

    async fn decrement_owner_quota_in_tx(
        tx: &mut Transaction<'_, Postgres>,
        quota_date: &str,
        owner: &QuotaOwnerKey,
        count: i64,
    ) -> StoreResult<()> {
        let updated = sqlx::query(
            "update chat_daily_owner_quotas
             set usage_count = usage_count - $4, updated_at = now()
             where quota_date = $1::date and owner_kind = $2 and owner_id = $3
               and usage_count >= $4",
        )
        .bind(quota_date)
        .bind(&owner.kind)
        .bind(owner.id)
        .bind(count)
        .execute(&mut **tx)
        .await?;
        if updated.rows_affected() != 1 {
            return Err(sqlx::Error::Protocol(
                "owner chat quota reservation counter is inconsistent".to_owned(),
            ));
        }
        sqlx::query(
            "delete from chat_daily_owner_quotas
             where quota_date = $1::date and owner_kind = $2 and owner_id = $3
               and usage_count = 0",
        )
        .bind(quota_date)
        .bind(&owner.kind)
        .bind(owner.id)
        .execute(&mut **tx)
        .await?;
        Ok(())
    }

    async fn decrement_global_reserved_quota_in_tx(
        tx: &mut Transaction<'_, Postgres>,
        quota_date: &str,
    ) -> StoreResult<()> {
        let updated = sqlx::query(
            "update chat_daily_global_quotas
             set reserved_count = reserved_count - 1, updated_at = now()
             where quota_date = $1::date and reserved_count > 0",
        )
        .bind(quota_date)
        .execute(&mut **tx)
        .await?;
        if updated.rows_affected() != 1 {
            return Err(sqlx::Error::Protocol(
                "global chat quota reservation counter is inconsistent".to_owned(),
            ));
        }
        Ok(())
    }

    async fn bangkok_quota_date_in_tx(tx: &mut Transaction<'_, Postgres>) -> StoreResult<String> {
        sqlx::query_scalar("select ((now() at time zone 'Asia/Bangkok')::date)::text")
            .fetch_one(&mut **tx)
            .await
    }

    async fn retry_after_bangkok_midnight_in_tx(
        tx: &mut Transaction<'_, Postgres>,
        quota_date: &str,
    ) -> StoreResult<u64> {
        let seconds: i64 = sqlx::query_scalar(
            "select greatest(
               1,
               ceil(extract(epoch from (
                 (($1::date + 1)::timestamp at time zone 'Asia/Bangkok') - now()
               )))::bigint
             )",
        )
        .bind(quota_date)
        .fetch_one(&mut **tx)
        .await?;
        u64::try_from(seconds).map_err(|_| {
            sqlx::Error::Protocol("daily chat quota retry interval is invalid".to_owned())
        })
    }

    #[cfg(test)]
    pub(crate) async fn quota_states_for_session_for_test(
        &self,
        session_id: Uuid,
    ) -> StoreResult<Vec<(String, String)>> {
        let rows = sqlx::query(
            "select owner_state, global_state
             from chat_generation_quota_reservations
             where request_session_id = $1
             order by created_at, id",
        )
        .bind(session_id)
        .fetch_all(self.db.as_ref())
        .await?;
        Ok(rows
            .into_iter()
            .map(|row| (row.get("owner_state"), row.get("global_state")))
            .collect())
    }

    #[cfg(test)]
    pub(crate) async fn delete_session_quota_for_test(&self, session_id: Uuid) -> StoreResult<()> {
        let mut tx = self.db.begin().await?;
        let rows = sqlx::query(
            "select id, quota_date::text as quota_date, owner_kind, owner_id,
                    owner_state, global_state
             from chat_generation_quota_reservations
             where request_session_id = $1
             for update",
        )
        .bind(session_id)
        .fetch_all(&mut *tx)
        .await?;
        for row in rows {
            let quota_date: String = row.get("quota_date");
            let owner_state: String = row.get("owner_state");
            let global_state: String = row.get("global_state");
            if matches!(owner_state.as_str(), "reserved" | "committed") {
                let owner = QuotaOwnerKey {
                    kind: row.get("owner_kind"),
                    id: row.get("owner_id"),
                };
                Self::decrement_owner_quota_in_tx(&mut tx, &quota_date, &owner, 1).await?;
            }
            match global_state.as_str() {
                "reserved" => {
                    Self::decrement_global_reserved_quota_in_tx(&mut tx, &quota_date).await?
                }
                "consumed" => {
                    let updated = sqlx::query(
                        "update chat_daily_global_quotas
                         set consumed_count = consumed_count - 1, updated_at = now()
                         where quota_date = $1::date and consumed_count > 0",
                    )
                    .bind(&quota_date)
                    .execute(&mut *tx)
                    .await?;
                    if updated.rows_affected() != 1 {
                        return Err(sqlx::Error::Protocol(
                            "global chat quota test counter is inconsistent".to_owned(),
                        ));
                    }
                }
                _ => {}
            }
            sqlx::query("delete from chat_generation_quota_reservations where id = $1")
                .bind(row.get::<Uuid, _>("id"))
                .execute(&mut *tx)
                .await?;
        }
        tx.commit().await?;
        Ok(())
    }

    #[cfg(test)]
    async fn cleanup_past_chat_generation_quotas_for_test(
        &self,
    ) -> StoreResult<QuotaRetentionCleanupCounts> {
        let mut tx = self.db.begin().await?;
        let counts = Self::cleanup_past_chat_generation_quotas_in_tx(&mut tx).await?;
        tx.commit().await?;
        Ok(counts)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn test_store() -> Option<ChatStore> {
        let database_url = std::env::var("WFCHAT_TEST_DATABASE_URL").ok()?;
        Some(
            ChatStore::connect(&database_url)
                .await
                .expect("WFCHAT_TEST_DATABASE_URL should identify a reachable test database"),
        )
    }

    fn admitted(outcome: ChatGenerationQuotaAdmission) -> Option<ChatGenerationQuotaReservation> {
        match outcome {
            ChatGenerationQuotaAdmission::Admitted(reservation) => Some(reservation),
            _ => None,
        }
    }

    async fn cleanup_reservations(store: &ChatStore, reservations: &[Uuid]) {
        for reservation_id in reservations {
            store
                .release_chat_generation_quota(*reservation_id)
                .await
                .expect("test reservation should release");
            let mut tx = store
                .db
                .begin()
                .await
                .expect("cleanup transaction should begin");
            let row = sqlx::query(
                "select quota_date::text as quota_date, global_state
                 from chat_generation_quota_reservations where id = $1 for update",
            )
            .bind(reservation_id)
            .fetch_optional(&mut *tx)
            .await
            .expect("test reservation should query");
            if let Some(row) = row {
                let quota_date: String = row.get("quota_date");
                if row.get::<String, _>("global_state") == "consumed" {
                    sqlx::query(
                        "update chat_daily_global_quotas
                         set consumed_count = consumed_count - 1
                         where quota_date = $1::date and consumed_count > 0",
                    )
                    .bind(&quota_date)
                    .execute(&mut *tx)
                    .await
                    .expect("consumed global test quota should decrement");
                }
                sqlx::query("delete from chat_generation_quota_reservations where id = $1")
                    .bind(reservation_id)
                    .execute(&mut *tx)
                    .await
                    .expect("test reservation should delete");
                sqlx::query(
                    "delete from chat_daily_global_quotas
                     where quota_date = $1::date and reserved_count = 0 and consumed_count = 0",
                )
                .bind(&quota_date)
                .execute(&mut *tx)
                .await
                .expect("empty global test counter should delete");
            }
            tx.commit()
                .await
                .expect("cleanup transaction should commit");
        }
    }

    async fn delete_sessions(store: &ChatStore, session_ids: &[Uuid]) {
        for session_id in session_ids {
            sqlx::query("delete from auth_sessions where id = $1")
                .bind(session_id)
                .execute(store.db.as_ref())
                .await
                .expect("test session should delete");
        }
    }

    async fn current_global_total(store: &ChatStore) -> i64 {
        sqlx::query_scalar(
            "select coalesce((
               select reserved_count + consumed_count
               from chat_daily_global_quotas
               where quota_date = (now() at time zone 'Asia/Bangkok')::date
             ), 0)::bigint",
        )
        .fetch_one(store.db.as_ref())
        .await
        .expect("global quota count should query")
    }

    async fn insert_terminal_past_quota_rows(store: &ChatStore, count: i32) -> String {
        let owner_id = Uuid::new_v4();
        let session_id = Uuid::new_v4();
        let chat_id = Uuid::new_v4();
        let seed = Uuid::new_v4().to_string();
        let mut tx = store.db.begin().await.unwrap();
        let quota_date: String =
            sqlx::query_scalar("select (((now() at time zone 'Asia/Bangkok')::date - 1))::text")
                .fetch_one(&mut *tx)
                .await
                .unwrap();
        sqlx::query(
            "insert into chat_daily_owner_quotas
               (quota_date, owner_kind, owner_id, usage_count)
             values ($1::date, 'guest', $2, $3)",
        )
        .bind(&quota_date)
        .bind(owner_id)
        .bind(count)
        .execute(&mut *tx)
        .await
        .unwrap();
        sqlx::query(
            "insert into chat_daily_global_quotas
               (quota_date, reserved_count, consumed_count)
             values ($1::date, 0, $2)",
        )
        .bind(&quota_date)
        .bind(count)
        .execute(&mut *tx)
        .await
        .unwrap();
        sqlx::query(
            "insert into chat_generation_quota_reservations
               (id, quota_date, request_session_id, chat_id, owner_kind, owner_id,
                owner_state, global_state, provider_started_at, committed_at)
             select md5($1 || sequence::text)::uuid, $2::date, $3, $4, 'guest', $5,
                    'committed', 'consumed', now(), now()
             from generate_series(1, $6::integer) as sequence",
        )
        .bind(seed)
        .bind(&quota_date)
        .bind(session_id)
        .bind(chat_id)
        .bind(owner_id)
        .bind(count)
        .execute(&mut *tx)
        .await
        .unwrap();
        tx.commit().await.unwrap();
        quota_date
    }

    async fn quota_table_count(store: &ChatStore, table: &str) -> i64 {
        let query = match table {
            "reservations" => "select count(*) from chat_generation_quota_reservations",
            "owners" => "select count(*) from chat_daily_owner_quotas",
            "globals" => "select count(*) from chat_daily_global_quotas",
            _ => panic!("unknown quota table"),
        };
        sqlx::query_scalar(query)
            .fetch_one(store.db.as_ref())
            .await
            .unwrap()
    }

    #[tokio::test]
    async fn retention_cleanup_is_batched_and_repeated_passes_drain_terminal_rows() {
        let Some(store) = test_store().await else {
            return;
        };
        let isolation = store.isolate_daily_chat_quota_test().await.unwrap();
        insert_terminal_past_quota_rows(
            &store,
            i32::try_from(RETENTION_CLEANUP_BATCH_SIZE + 1).unwrap(),
        )
        .await;

        let first = store
            .cleanup_past_chat_generation_quotas_for_test()
            .await
            .unwrap();
        assert_eq!(first.reservations, RETENTION_CLEANUP_BATCH_SIZE);
        assert_eq!(first.owner_counters, 1);
        assert_eq!(first.global_counters, 1);
        assert_eq!(quota_table_count(&store, "reservations").await, 1);

        let second = store
            .cleanup_past_chat_generation_quotas_for_test()
            .await
            .unwrap();
        assert_eq!(
            second,
            QuotaRetentionCleanupCounts {
                reservations: 1,
                ..QuotaRetentionCleanupCounts::default()
            }
        );
        assert_eq!(quota_table_count(&store, "reservations").await, 0);
        assert_eq!(quota_table_count(&store, "owners").await, 0);
        assert_eq!(quota_table_count(&store, "globals").await, 0);
        assert_eq!(
            store
                .cleanup_past_chat_generation_quotas_for_test()
                .await
                .unwrap(),
            QuotaRetentionCleanupCounts::default()
        );
        isolation.finish().await.unwrap();
    }

    #[tokio::test]
    async fn retention_cleanup_deletes_terminal_rows_but_preserves_in_flight_rows_and_counters() {
        let Some(store) = test_store().await else {
            return;
        };
        let isolation = store.isolate_daily_chat_quota_test().await.unwrap();
        let quota_date = insert_terminal_past_quota_rows(&store, 1).await;
        let owner_id: Uuid = sqlx::query_scalar(
            "select owner_id from chat_daily_owner_quotas where quota_date = $1::date",
        )
        .bind(&quota_date)
        .fetch_one(store.db.as_ref())
        .await
        .unwrap();
        sqlx::query(
            "update chat_daily_owner_quotas
             set usage_count = 3 where quota_date = $1::date",
        )
        .bind(&quota_date)
        .execute(store.db.as_ref())
        .await
        .unwrap();
        sqlx::query(
            "update chat_daily_global_quotas
             set reserved_count = 1, consumed_count = 2 where quota_date = $1::date",
        )
        .bind(&quota_date)
        .execute(store.db.as_ref())
        .await
        .unwrap();
        sqlx::query(
            "insert into chat_generation_quota_reservations
               (id, quota_date, request_session_id, chat_id, owner_kind, owner_id,
                owner_state, global_state, provider_started_at)
             values
               ($1, $3::date, $4, $5, 'guest', $6, 'reserved', 'reserved', null),
               ($2, $3::date, $4, $5, 'guest', $6, 'reserved', 'consumed', now())",
        )
        .bind(Uuid::new_v4())
        .bind(Uuid::new_v4())
        .bind(&quota_date)
        .bind(Uuid::new_v4())
        .bind(Uuid::new_v4())
        .bind(owner_id)
        .execute(store.db.as_ref())
        .await
        .unwrap();

        let counts = store
            .cleanup_past_chat_generation_quotas_for_test()
            .await
            .unwrap();
        assert_eq!(
            counts,
            QuotaRetentionCleanupCounts {
                reservations: 1,
                ..QuotaRetentionCleanupCounts::default()
            }
        );
        let states = sqlx::query_as::<_, (String, String)>(
            "select owner_state, global_state
             from chat_generation_quota_reservations
             order by global_state",
        )
        .fetch_all(store.db.as_ref())
        .await
        .unwrap();
        assert_eq!(
            states,
            [
                ("reserved".to_owned(), "consumed".to_owned()),
                ("reserved".to_owned(), "reserved".to_owned()),
            ]
        );
        assert_eq!(quota_table_count(&store, "owners").await, 1);
        assert_eq!(quota_table_count(&store, "globals").await, 1);
        isolation.finish().await.unwrap();
    }

    #[tokio::test]
    async fn concurrent_retention_cleanup_is_retry_safe_and_idempotent() {
        let Some(store) = test_store().await else {
            return;
        };
        let isolation = store.isolate_daily_chat_quota_test().await.unwrap();
        insert_terminal_past_quota_rows(
            &store,
            i32::try_from(RETENTION_CLEANUP_BATCH_SIZE * 2).unwrap(),
        )
        .await;

        let (first, second) = tokio::join!(
            store.cleanup_past_chat_generation_quotas_for_test(),
            store.cleanup_past_chat_generation_quotas_for_test()
        );
        let deleted = first.unwrap().reservations + second.unwrap().reservations;
        assert_eq!(deleted, RETENTION_CLEANUP_BATCH_SIZE * 2);
        assert_eq!(quota_table_count(&store, "reservations").await, 0);
        assert_eq!(
            store
                .cleanup_past_chat_generation_quotas_for_test()
                .await
                .unwrap(),
            QuotaRetentionCleanupCounts::default()
        );
        isolation.finish().await.unwrap();
    }

    #[tokio::test]
    async fn reserving_current_quota_triggers_one_past_retention_pass() {
        let Some(store) = test_store().await else {
            return;
        };
        let isolation = store.isolate_daily_chat_quota_test().await.unwrap();
        insert_terminal_past_quota_rows(&store, 1).await;
        let session = store.create_guest_session().await.unwrap();
        let reservation = admitted(
            store
                .reserve_chat_generation_quota(session.id, Uuid::new_v4(), 1, 1, 2_000, 600)
                .await
                .unwrap(),
        )
        .unwrap();

        let past_count: i64 = sqlx::query_scalar(
            "select count(*) from chat_generation_quota_reservations
             where quota_date < (now() at time zone 'Asia/Bangkok')::date",
        )
        .fetch_one(store.db.as_ref())
        .await
        .unwrap();
        assert_eq!(past_count, 0);

        cleanup_reservations(&store, &[reservation.id]).await;
        delete_sessions(&store, &[session.id]).await;
        isolation.finish().await.unwrap();
    }

    #[tokio::test]
    async fn concurrent_owner_admission_is_atomic_and_releases_retry_safely() {
        let Some(store) = test_store().await else {
            return;
        };
        let isolation = store.isolate_daily_chat_quota_test().await.unwrap();
        let session = store.create_guest_session().await.unwrap();
        let chat_id = Uuid::new_v4();
        let first = store.reserve_chat_generation_quota(session.id, chat_id, 1, 1, 2_000, 600);
        let second = store.reserve_chat_generation_quota(session.id, chat_id, 1, 1, 2_000, 600);
        let (first, second) = tokio::join!(first, second);
        let first = first.unwrap();
        let second = second.unwrap();
        let reservations = [admitted(first), admitted(second)]
            .into_iter()
            .flatten()
            .collect::<Vec<_>>();
        assert_eq!(reservations.len(), 1);
        let rejected = if reservations[0].id
            == admitted(first)
                .map(|reservation| reservation.id)
                .unwrap_or_default()
        {
            second
        } else {
            first
        };
        assert!(matches!(
            rejected,
            ChatGenerationQuotaAdmission::OwnerLimitReached {
                retry_after_seconds: 1..=86_400
            }
        ));

        store
            .release_chat_generation_quota(reservations[0].id)
            .await
            .unwrap();
        store
            .release_chat_generation_quota(reservations[0].id)
            .await
            .unwrap();
        let retried = admitted(
            store
                .reserve_chat_generation_quota(session.id, chat_id, 1, 1, 2_000, 600)
                .await
                .unwrap(),
        )
        .expect("released owner and global allowances should be reusable");

        cleanup_reservations(&store, &[reservations[0].id, retried.id]).await;
        delete_sessions(&store, &[session.id]).await;
        isolation.finish().await.unwrap();
    }

    #[tokio::test]
    async fn provider_started_global_use_is_not_refunded_when_owner_use_releases() {
        let Some(store) = test_store().await else {
            return;
        };
        let isolation = store.isolate_daily_chat_quota_test().await.unwrap();
        let baseline = current_global_total(&store).await;
        let limit = u32::try_from(baseline + 1).expect("test global count should fit u32");
        let first_session = store.create_guest_session().await.unwrap();
        let second_session = store.create_guest_session().await.unwrap();
        let first_admission = store.reserve_chat_generation_quota(
            first_session.id,
            Uuid::new_v4(),
            50,
            50,
            limit,
            600,
        );
        let second_admission = store.reserve_chat_generation_quota(
            second_session.id,
            Uuid::new_v4(),
            50,
            50,
            limit,
            600,
        );
        let (first_admission, second_admission) = tokio::join!(first_admission, second_admission);
        let first_admission = first_admission.unwrap();
        let second_admission = second_admission.unwrap();
        let admitted_reservations = [admitted(first_admission), admitted(second_admission)]
            .into_iter()
            .flatten()
            .collect::<Vec<_>>();
        assert_eq!(admitted_reservations.len(), 1);
        assert!(
            [first_admission, second_admission]
                .iter()
                .any(|admission| matches!(
                    admission,
                    ChatGenerationQuotaAdmission::GlobalLimitReached {
                        retry_after_seconds: 1..=86_400
                    }
                )),
            "the global owner/global transaction must reject one concurrent request"
        );
        let first = admitted_reservations[0];
        assert!(store
            .mark_chat_generation_provider_started(first.id)
            .await
            .unwrap());
        assert!(store
            .mark_chat_generation_provider_started(first.id)
            .await
            .unwrap());
        store.release_chat_generation_quota(first.id).await.unwrap();

        let rejected_after_provider_start = store
            .reserve_chat_generation_quota(second_session.id, Uuid::new_v4(), 50, 50, limit, 600)
            .await
            .unwrap();
        assert!(matches!(
            rejected_after_provider_start,
            ChatGenerationQuotaAdmission::GlobalLimitReached {
                retry_after_seconds: 1..=86_400
            }
        ));

        cleanup_reservations(&store, &[first.id]).await;
        delete_sessions(&store, &[first_session.id, second_session.id]).await;
        isolation.finish().await.unwrap();
    }

    #[tokio::test]
    async fn registered_sessions_share_an_account_quota_while_guests_are_isolated() {
        let Some(store) = test_store().await else {
            return;
        };
        let isolation = store.isolate_daily_chat_quota_test().await.unwrap();
        let account_user_id = Uuid::new_v4();
        let first_account_session = store.create_guest_session().await.unwrap();
        let second_account_session = store.create_guest_session().await.unwrap();
        let first_account_session = store
            .promote_session_to_registered(first_account_session.id, account_user_id)
            .await
            .unwrap()
            .unwrap();
        let second_account_session = store
            .promote_session_to_registered(second_account_session.id, account_user_id)
            .await
            .unwrap()
            .unwrap();
        let account_reservation = admitted(
            store
                .reserve_chat_generation_quota(
                    first_account_session.id,
                    Uuid::new_v4(),
                    1,
                    1,
                    2_000,
                    600,
                )
                .await
                .unwrap(),
        )
        .unwrap();
        assert!(matches!(
            store
                .reserve_chat_generation_quota(
                    second_account_session.id,
                    Uuid::new_v4(),
                    1,
                    1,
                    2_000,
                    600,
                )
                .await
                .unwrap(),
            ChatGenerationQuotaAdmission::OwnerLimitReached {
                retry_after_seconds: 1..=86_400
            }
        ));

        let first_guest = store.create_guest_session().await.unwrap();
        let second_guest = store.create_guest_session().await.unwrap();
        let first_guest_reservation = admitted(
            store
                .reserve_chat_generation_quota(first_guest.id, Uuid::new_v4(), 1, 1, 2_000, 600)
                .await
                .unwrap(),
        )
        .expect("first guest should have an independent owner quota");
        let second_guest_reservation = admitted(
            store
                .reserve_chat_generation_quota(second_guest.id, Uuid::new_v4(), 1, 1, 2_000, 600)
                .await
                .unwrap(),
        )
        .expect("second guest should have an independent owner quota");

        cleanup_reservations(
            &store,
            &[
                account_reservation.id,
                first_guest_reservation.id,
                second_guest_reservation.id,
            ],
        )
        .await;
        delete_sessions(
            &store,
            &[
                first_account_session.id,
                second_account_session.id,
                first_guest.id,
                second_guest.id,
            ],
        )
        .await;
        isolation.finish().await.unwrap();
    }

    #[tokio::test]
    async fn stale_recovery_refunds_only_allowances_that_were_not_consumed() {
        let Some(store) = test_store().await else {
            return;
        };
        let isolation = store.isolate_daily_chat_quota_test().await.unwrap();
        let session = store.create_guest_session().await.unwrap();
        let first = admitted(
            store
                .reserve_chat_generation_quota(session.id, Uuid::new_v4(), 1, 1, 2_000, 600)
                .await
                .unwrap(),
        )
        .unwrap();
        sqlx::query(
            "update chat_generation_quota_reservations
             set updated_at = now() - interval '1 hour' where id = $1",
        )
        .bind(first.id)
        .execute(store.db.as_ref())
        .await
        .unwrap();
        let second = admitted(
            store
                .reserve_chat_generation_quota(session.id, Uuid::new_v4(), 1, 1, 2_000, 60)
                .await
                .unwrap(),
        )
        .expect("stale pre-provider reservation should release both allowances");
        assert!(store
            .mark_chat_generation_provider_started(second.id)
            .await
            .unwrap());
        sqlx::query(
            "update chat_generation_quota_reservations
             set updated_at = now() - interval '1 hour' where id = $1",
        )
        .bind(second.id)
        .execute(store.db.as_ref())
        .await
        .unwrap();
        let third = admitted(
            store
                .reserve_chat_generation_quota(session.id, Uuid::new_v4(), 1, 1, 2_000, 60)
                .await
                .unwrap(),
        )
        .expect("stale provider-started reservation should release only owner allowance");
        let second_global_state: String = sqlx::query_scalar(
            "select global_state from chat_generation_quota_reservations where id = $1",
        )
        .bind(second.id)
        .fetch_one(store.db.as_ref())
        .await
        .unwrap();
        assert_eq!(second_global_state, "consumed");

        cleanup_reservations(&store, &[first.id, second.id, third.id]).await;
        delete_sessions(&store, &[session.id]).await;
        isolation.finish().await.unwrap();
    }

    #[tokio::test]
    async fn owner_finalization_rolls_back_with_the_chat_turn() {
        let Some(store) = test_store().await else {
            return;
        };
        let isolation = store.isolate_daily_chat_quota_test().await.unwrap();
        let session = store.create_guest_session().await.unwrap();
        let owner = OwnerScope::from_session(&session);
        let chat = store
            .create_chat(owner, "aiko".to_owned(), "aiko_default".to_owned())
            .await
            .unwrap();
        let reservation = admitted(
            store
                .reserve_chat_generation_quota(session.id, chat.id, 1, 1, 2_000, 600)
                .await
                .unwrap(),
        )
        .unwrap();
        assert!(store
            .mark_chat_generation_provider_started(reservation.id)
            .await
            .unwrap());
        store
            .release_chat_generation_quota(reservation.id)
            .await
            .unwrap();

        let append = store
            .append_chat_messages_limited_with_quota(
                owner,
                chat.id,
                StoredMessage::from_ai_message(AiMessage::user("hello".to_owned())),
                StoredMessage::from_ai_message(AiMessage::assistant("reply".to_owned())),
                &[],
                "Asia/Bangkok",
                ChatStorageLimits::default(),
                Some(reservation.id),
            )
            .await;
        assert!(append.is_err());
        assert!(store
            .get_chat(owner, chat.id)
            .await
            .unwrap()
            .unwrap()
            .messages
            .is_empty());

        cleanup_reservations(&store, &[reservation.id]).await;
        let _ = store.delete_chat(owner, chat.id).await;
        delete_sessions(&store, &[session.id]).await;
        isolation.finish().await.unwrap();
    }

    #[tokio::test]
    async fn login_and_logout_do_not_mint_a_new_same_day_owner_allowance() {
        let Some(store) = test_store().await else {
            return;
        };
        let isolation = store.isolate_daily_chat_quota_test().await.unwrap();
        let guest = store.create_guest_session().await.unwrap();
        let first = admitted(
            store
                .reserve_chat_generation_quota(guest.id, Uuid::new_v4(), 1, 1, 2_000, 600)
                .await
                .unwrap(),
        )
        .unwrap();
        let account_user_id = Uuid::new_v4();
        let account = store
            .promote_guest_session_with_google(
                guest.id,
                account_user_id,
                &format!("quota-test-{}", Uuid::new_v4()),
                None,
                None,
                None,
            )
            .await
            .unwrap()
            .expect("guest login should create a registered replacement");
        assert!(matches!(
            store
                .reserve_chat_generation_quota(account.id, Uuid::new_v4(), 1, 1, 2_000, 600)
                .await
                .unwrap(),
            ChatGenerationQuotaAdmission::OwnerLimitReached {
                retry_after_seconds: 1..=86_400
            }
        ));

        let logout_guest = store
            .logout_registered_session_to_guest(account.id)
            .await
            .unwrap()
            .expect("registered logout should create a guest replacement");
        assert!(matches!(
            store
                .reserve_chat_generation_quota(logout_guest.id, Uuid::new_v4(), 1, 1, 2_000, 600,)
                .await
                .unwrap(),
            ChatGenerationQuotaAdmission::OwnerLimitReached {
                retry_after_seconds: 1..=86_400
            }
        ));

        sqlx::query(
            "update auth_sessions
             set quota_carryover_date = (now() at time zone 'Asia/Bangkok')::date - 1
             where id = $1",
        )
        .bind(logout_guest.id)
        .execute(store.db.as_ref())
        .await
        .unwrap();
        let next_day_subject = admitted(
            store
                .reserve_chat_generation_quota(logout_guest.id, Uuid::new_v4(), 1, 1, 2_000, 600)
                .await
                .unwrap(),
        )
        .expect("expired logout carry-over should return to the guest session subject");

        cleanup_reservations(&store, &[first.id, next_day_subject.id]).await;
        delete_sessions(&store, &[logout_guest.id, account.id, guest.id]).await;
        isolation.finish().await.unwrap();
    }
}
