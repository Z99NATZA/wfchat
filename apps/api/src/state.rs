use reqwest::Client;
use std::time::Duration as StdDuration;
use tokio::time::{sleep, Duration};

const GUEST_SESSION_CLEANUP_INTERVAL_SECONDS: u64 = 10 * 60;

use crate::{
    attachments::{
        cleanup_stale_pending_chat_attachments, process_chat_attachment_file_deletions,
        AttachmentOrphanScan, ImageDecodeLimiter, PENDING_ATTACHMENT_CLEANUP_INTERVAL_SECONDS,
    },
    cafe::CafeHub,
    config::Config,
    memory::{spawn_memory_capture_worker, MemoryTelemetry},
    rate_limit::{GenerationLimiter, RateLimitPolicies, RateLimiter},
    store::ChatStore,
};

#[derive(Clone)]
pub struct AppState {
    pub config: Config,
    pub http: Client,
    pub rate_limiter: RateLimiter,
    pub generation_limiter: GenerationLimiter,
    pub image_decode_limiter: ImageDecodeLimiter,
    pub store: ChatStore,
    pub cafe: CafeHub,
    pub memory_telemetry: MemoryTelemetry,
}

impl AppState {
    pub async fn new(config: Config) -> Result<Self, sqlx::Error> {
        Self::build(config, BackgroundWorkerOptions::PRODUCTION).await
    }

    #[cfg(test)]
    pub(crate) async fn new_without_background_workers_for_test(
        config: Config,
    ) -> Result<Self, sqlx::Error> {
        Self::build(config, BackgroundWorkerOptions::NONE).await
    }

    async fn build(
        config: Config,
        background_workers: BackgroundWorkerOptions,
    ) -> Result<Self, sqlx::Error> {
        let store = ChatStore::connect(&config.database_url).await?;
        let http = Client::builder()
            .connect_timeout(StdDuration::from_secs(
                config.security.chat.ai_connect_timeout_seconds,
            ))
            .timeout(StdDuration::from_secs(
                config.security.chat.ai_total_timeout_seconds,
            ))
            .build()
            .expect("validated HTTP client configuration should build");
        let rate_limiter = RateLimiter::new(RateLimitPolicies::from_config(&config));
        let generation_limiter = GenerationLimiter::new(
            config.security.chat.max_concurrent_generations,
            config.security.chat.max_concurrent_per_session,
        );
        let image_decode_limiter =
            ImageDecodeLimiter::new(config.chat_attachment_max_concurrent_decodes);
        let cafe = CafeHub::new(config.security.cafe.clone());

        let state = Self {
            config,
            http,
            rate_limiter,
            generation_limiter,
            image_decode_limiter,
            store,
            cafe,
            memory_telemetry: MemoryTelemetry::default(),
        };

        if background_workers.attachment_maintenance {
            spawn_attachment_maintenance(state.config.clone(), state.store.clone());
        }
        if background_workers.guest_cleanup {
            spawn_guest_session_cleanup(state.store.clone());
        }
        if background_workers.memory_capture {
            spawn_memory_capture_worker(state.clone());
        }
        if background_workers.cafe_maintenance {
            spawn_cafe_maintenance(state.cafe.clone(), state.config.clone());
        }

        Ok(state)
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct BackgroundWorkerOptions {
    memory_capture: bool,
    guest_cleanup: bool,
    attachment_maintenance: bool,
    cafe_maintenance: bool,
}

impl BackgroundWorkerOptions {
    const PRODUCTION: Self = Self {
        memory_capture: true,
        guest_cleanup: true,
        attachment_maintenance: true,
        cafe_maintenance: true,
    };
    #[cfg(test)]
    const NONE: Self = Self {
        memory_capture: false,
        guest_cleanup: false,
        attachment_maintenance: false,
        cafe_maintenance: false,
    };
}

fn spawn_cafe_maintenance(cafe: CafeHub, config: Config) {
    tokio::spawn(async move {
        let mut cleanup = tokio::time::interval_at(
            tokio::time::Instant::now()
                + Duration::from_secs(config.security.cafe.cleanup_interval_seconds),
            Duration::from_secs(config.security.cafe.cleanup_interval_seconds),
        );
        cleanup.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        let mut telemetry = tokio::time::interval_at(
            tokio::time::Instant::now()
                + Duration::from_secs(config.security.cafe.telemetry_interval_seconds),
            Duration::from_secs(config.security.cafe.telemetry_interval_seconds),
        );
        telemetry.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        loop {
            tokio::select! {
                _ = cleanup.tick() => cafe.cleanup_expired().await,
                _ = telemetry.tick() => cafe.emit_telemetry().await,
            }
        }
    });
}

fn spawn_guest_session_cleanup(store: ChatStore) {
    tokio::spawn(async move {
        loop {
            match store.cleanup_inactive_guest_sessions().await {
                Ok(cleaned_count) if cleaned_count > 0 => {
                    tracing::info!(cleaned_count, "cleaned inactive guest sessions");
                }
                Ok(_) => {}
                Err(error) => {
                    tracing::error!(%error, "failed to clean inactive guest sessions");
                }
            }

            sleep(Duration::from_secs(GUEST_SESSION_CLEANUP_INTERVAL_SECONDS)).await;
        }
    });
}

fn spawn_attachment_maintenance(config: Config, store: ChatStore) {
    tokio::spawn(async move {
        let mut orphan_scan = AttachmentOrphanScan::default();
        loop {
            let cleaned_count = cleanup_stale_pending_chat_attachments(&store).await;
            if cleaned_count > 0 {
                tracing::info!(
                    cleaned_count,
                    "cleaned stale pending chat image attachments"
                );
            }
            let reconciliation = orphan_scan.run(&config, &store).await;
            if reconciliation.enqueued_files > 0 {
                tracing::info!(
                    reconciled_count = reconciliation.enqueued_files,
                    inspected_entries = reconciliation.inspected_entries,
                    reached_end = reconciliation.reached_end,
                    "enqueued orphaned chat image files for deletion"
                );
            }
            let deleted_count = process_chat_attachment_file_deletions(&config, &store).await;
            if deleted_count > 0 {
                tracing::info!(deleted_count, "deleted chat attachment files");
            }

            sleep(Duration::from_secs(
                PENDING_ATTACHMENT_CLEANUP_INTERVAL_SECONDS,
            ))
            .await;
        }
    });
}

#[cfg(test)]
mod tests {
    use super::BackgroundWorkerOptions;

    #[test]
    fn constructors_select_all_production_workers_and_no_test_workers() {
        assert_eq!(
            BackgroundWorkerOptions::PRODUCTION,
            BackgroundWorkerOptions {
                memory_capture: true,
                guest_cleanup: true,
                attachment_maintenance: true,
                cafe_maintenance: true,
            }
        );
        assert_eq!(
            BackgroundWorkerOptions::NONE,
            BackgroundWorkerOptions {
                memory_capture: false,
                guest_cleanup: false,
                attachment_maintenance: false,
                cafe_maintenance: false,
            }
        );
    }
}
