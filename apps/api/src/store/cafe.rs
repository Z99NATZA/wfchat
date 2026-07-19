use super::*;
use std::collections::BTreeSet;

use crate::cafe_cosmetics::{cafe_cosmetic, unlocked_cafe_cosmetic_ids};

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

        unlocked_cosmetics.extend(unlocked_cafe_cosmetic_ids(cafe_stars));
        let unlocked_cosmetics = unlocked_cosmetics.into_iter().collect::<Vec<_>>();

        sqlx::query(
            "insert into cafe_progress (
                owner_session_id, owner_user_id, cafe_stars, unlocked_cosmetics, updated_at
             ) values ($1, $2, 0, $3, now())
             on conflict (owner_session_id)
             do update set
                owner_user_id = coalesce(excluded.owner_user_id, cafe_progress.owner_user_id),
                unlocked_cosmetics = excluded.unlocked_cosmetics,
                updated_at = now()",
        )
        .bind(owner.session_id)
        .bind(owner.user_id)
        .bind(&unlocked_cosmetics)
        .execute(self.db.as_ref())
        .await?;

        let equipped_cosmetic = sqlx::query_scalar::<_, Option<String>>(
            "select equipped_cosmetic
             from cafe_cosmetic_loadouts
             where (($2::uuid is not null and owner_user_id = $2)
                    or ($2::uuid is null and owner_session_id = $1))
             order by updated_at desc, owner_session_id desc
             limit 1",
        )
        .bind(owner.session_id)
        .bind(owner.user_id)
        .fetch_optional(self.db.as_ref())
        .await?
        .flatten()
        .filter(|cosmetic_id| {
            cafe_cosmetic(cosmetic_id).is_some() && unlocked_cosmetics.contains(cosmetic_id)
        });

        Ok(CafeProgressRecord {
            cafe_stars,
            unlocked_cosmetics,
            equipped_cosmetic,
        })
    }

    pub async fn equip_cafe_cosmetic(
        &self,
        owner: OwnerScope,
        cosmetic_id: Option<&str>,
    ) -> StoreResult<bool> {
        let progress = self.get_cafe_progress(owner).await?;
        if cosmetic_id.is_some_and(|id| {
            cafe_cosmetic(id).is_none()
                || !progress.unlocked_cosmetics.iter().any(|item| item == id)
        }) {
            return Ok(false);
        }

        sqlx::query(
            "insert into cafe_cosmetic_loadouts (
                owner_session_id, owner_user_id, equipped_cosmetic, updated_at
             ) values ($1, $2, $3, now())
             on conflict (owner_session_id)
             do update set
                owner_user_id = coalesce(excluded.owner_user_id, cafe_cosmetic_loadouts.owner_user_id),
                equipped_cosmetic = excluded.equipped_cosmetic,
                updated_at = now()",
        )
        .bind(owner.session_id)
        .bind(owner.user_id)
        .bind(cosmetic_id)
        .execute(self.db.as_ref())
        .await?;

        Ok(true)
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

    pub async fn award_cafe_round_completion(
        &self,
        room_id: Uuid,
        round_number: u32,
        owners: &[OwnerScope],
    ) -> StoreResult<Vec<Uuid>> {
        let mut tx = self.db.begin().await?;
        let mut awarded_session_ids = Vec::new();

        for owner in owners {
            let inserted = sqlx::query_scalar::<_, Uuid>(
                "insert into cafe_room_rewards (
                    room_id, round_number, owner_session_id, owner_user_id, cafe_stars
                 ) values ($1, $2, $3, $4, 1)
                 on conflict (room_id, round_number, owner_session_id) do nothing
                 returning owner_session_id",
            )
            .bind(room_id)
            .bind(i32::try_from(round_number).unwrap_or(i32::MAX))
            .bind(owner.session_id)
            .bind(owner.user_id)
            .fetch_optional(&mut *tx)
            .await?;

            if inserted.is_some() {
                awarded_session_ids.push(owner.session_id);
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
        Ok(awarded_session_ids)
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
        assert_eq!(progress.unlocked_cosmetics, vec!["sakura_pin"]);
        assert!(!store
            .equip_cafe_cosmetic(guest_owner, Some("mint_scarf"))
            .await
            .expect("locked cosmetic validation should succeed"));

        let progress = store
            .add_cafe_stars(guest_owner, 1)
            .await
            .expect("third guest star should persist");
        assert_eq!(progress.cafe_stars, 3);
        assert_eq!(
            progress.unlocked_cosmetics,
            vec!["mint_scarf", "sakura_pin"]
        );
        assert!(store
            .equip_cafe_cosmetic(guest_owner, Some("mint_scarf"))
            .await
            .expect("unlocked cosmetic should equip"));

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
        assert_eq!(account_progress.cafe_stars, 3);
        assert_eq!(
            account_progress.equipped_cosmetic.as_deref(),
            Some("mint_scarf")
        );

        let second_guest = store
            .create_guest_session()
            .await
            .expect("second guest session should create");
        let second_registered = store
            .promote_session_to_registered(second_guest.id, user_id)
            .await
            .expect("second session should promote")
            .expect("second promoted session should exist");
        store
            .migrate_session_data_to_user(second_registered.id, user_id)
            .await
            .expect("second session data should migrate");
        let second_owner = OwnerScope::from_session(&second_registered);
        let shared_progress = store
            .get_cafe_progress(second_owner)
            .await
            .expect("account progress should be shared");
        assert_eq!(shared_progress.cafe_stars, 3);
        assert_eq!(
            shared_progress.equipped_cosmetic.as_deref(),
            Some("mint_scarf")
        );

        let shared_progress = store
            .add_cafe_stars(second_owner, 2)
            .await
            .expect("second session stars should aggregate");
        assert_eq!(shared_progress.cafe_stars, 5);
        assert!(shared_progress
            .unlocked_cosmetics
            .iter()
            .any(|id| id == "tea_hat"));
        assert!(store
            .equip_cafe_cosmetic(second_owner, Some("tea_hat"))
            .await
            .expect("new account cosmetic should equip"));
        assert_eq!(
            store
                .get_cafe_progress(OwnerScope::from_session(&registered))
                .await
                .expect("first session should see latest account loadout")
                .equipped_cosmetic
                .as_deref(),
            Some("tea_hat")
        );

        sqlx::query("delete from auth_sessions where id = $1")
            .bind(registered.id)
            .execute(store.db.as_ref())
            .await
            .expect("test session should clean up");
        sqlx::query("delete from auth_sessions where id = $1")
            .bind(second_registered.id)
            .execute(store.db.as_ref())
            .await
            .expect("second test session should clean up");
    }

    #[tokio::test]
    async fn cafe_round_rewards_are_idempotent_per_round() {
        let Some(store) = test_store().await else {
            return;
        };
        let session = store
            .create_guest_session()
            .await
            .expect("guest session should create");
        let owner = OwnerScope::from_session(&session);
        let room_id = Uuid::new_v4();

        let first = store
            .award_cafe_round_completion(room_id, 1, &[owner])
            .await
            .expect("first round should award");
        let duplicate = store
            .award_cafe_round_completion(room_id, 1, &[owner])
            .await
            .expect("duplicate round should be ignored");
        let second = store
            .award_cafe_round_completion(room_id, 2, &[owner])
            .await
            .expect("second round should award");
        let progress = store
            .get_cafe_progress(owner)
            .await
            .expect("progress should load");

        assert_eq!(first, vec![session.id]);
        assert!(duplicate.is_empty());
        assert_eq!(second, vec![session.id]);
        assert_eq!(progress.cafe_stars, 2);

        sqlx::query("delete from auth_sessions where id = $1")
            .bind(session.id)
            .execute(store.db.as_ref())
            .await
            .expect("test session should clean up");
    }
}
