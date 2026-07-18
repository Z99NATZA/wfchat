use super::*;
use std::collections::BTreeSet;

impl ChatStore {
    pub async fn get_cafe_progress(&self, owner: OwnerScope) -> StoreResult<CafeProgressRecord> {
        let rows = sqlx::query(
            "select cafe_stars, unlocked_cosmetics
             from cafe_progress
             where (($2::uuid is not null and owner_user_id = $2)
                    or ($2::uuid is null and owner_session_id = $1))",
        )
        .bind(owner.session_id)
        .bind(owner.user_id)
        .fetch_all(self.db.as_ref())
        .await?;

        let mut cafe_stars = 0_u32;
        let mut unlocked_cosmetics = BTreeSet::new();
        for row in rows {
            cafe_stars = cafe_stars.saturating_add(row.get::<i32, _>("cafe_stars").max(0) as u32);
            unlocked_cosmetics.extend(row.get::<Vec<String>, _>("unlocked_cosmetics"));
        }

        Ok(CafeProgressRecord {
            cafe_stars,
            unlocked_cosmetics: unlocked_cosmetics.into_iter().collect(),
        })
    }

    pub async fn add_cafe_stars(
        &self,
        owner: OwnerScope,
        amount: u32,
    ) -> StoreResult<CafeProgressRecord> {
        sqlx::query(
            "insert into cafe_progress (
                owner_session_id, owner_user_id, cafe_stars, unlocked_cosmetics, updated_at
             ) values ($1, $2, $3, '{}', now())
             on conflict (owner_session_id)
             do update set
                owner_user_id = coalesce(excluded.owner_user_id, cafe_progress.owner_user_id),
                cafe_stars = cafe_progress.cafe_stars + excluded.cafe_stars,
                updated_at = now()",
        )
        .bind(owner.session_id)
        .bind(owner.user_id)
        .bind(i32::try_from(amount).unwrap_or(i32::MAX))
        .execute(self.db.as_ref())
        .await?;

        self.get_cafe_progress(owner).await
    }

    pub async fn award_cafe_room_completion(
        &self,
        room_id: Uuid,
        owners: &[OwnerScope],
    ) -> StoreResult<()> {
        let mut tx = self.db.begin().await?;

        for owner in owners {
            let inserted = sqlx::query_scalar::<_, Uuid>(
                "insert into cafe_room_rewards (
                    room_id, owner_session_id, owner_user_id, cafe_stars
                 ) values ($1, $2, $3, 1)
                 on conflict (room_id, owner_session_id) do nothing
                 returning owner_session_id",
            )
            .bind(room_id)
            .bind(owner.session_id)
            .bind(owner.user_id)
            .fetch_optional(&mut *tx)
            .await?;

            if inserted.is_some() {
                sqlx::query(
                    "insert into cafe_progress (
                        owner_session_id, owner_user_id, cafe_stars, unlocked_cosmetics, updated_at
                     ) values ($1, $2, 1, '{}', now())
                     on conflict (owner_session_id)
                     do update set
                        owner_user_id = coalesce(excluded.owner_user_id, cafe_progress.owner_user_id),
                        cafe_stars = cafe_progress.cafe_stars + 1,
                        updated_at = now()",
                )
                .bind(owner.session_id)
                .bind(owner.user_id)
                .execute(&mut *tx)
                .await?;
            }
        }

        tx.commit().await?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn test_store() -> Option<ChatStore> {
        let database_url = std::env::var("WFCHAT_TEST_DATABASE_URL").ok()?;
        ChatStore::connect(&database_url).await.ok()
    }

    #[tokio::test]
    async fn cafe_stars_persist_for_a_guest_and_follow_account_promotion() {
        let Some(store) = test_store().await else {
            return;
        };
        let guest = store
            .create_guest_session()
            .await
            .expect("guest session should create");
        let guest_owner = OwnerScope::from_session(&guest);

        let progress = store
            .add_cafe_stars(guest_owner, 2)
            .await
            .expect("guest stars should persist");
        assert_eq!(progress.cafe_stars, 2);

        let user_id = Uuid::new_v4();
        let registered = store
            .promote_session_to_registered(guest.id, user_id)
            .await
            .expect("session should promote")
            .expect("promoted session should exist");
        store
            .migrate_session_data_to_user(registered.id, user_id)
            .await
            .expect("cafe progress should migrate");

        let account_progress = store
            .get_cafe_progress(OwnerScope::from_session(&registered))
            .await
            .expect("account progress should load");
        assert_eq!(account_progress.cafe_stars, 2);

        sqlx::query("delete from auth_sessions where id = $1")
            .bind(registered.id)
            .execute(store.db.as_ref())
            .await
            .expect("test session should clean up");
    }
}
