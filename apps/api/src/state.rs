use reqwest::Client;
use std::time::Duration as StdDuration;
use tokio::time::{sleep, Duration};

const GUEST_SESSION_CLEANUP_INTERVAL_SECONDS: u64 = 10 * 60;

use crate::{
    attachments::{
        cleanup_stale_pending_chat_attachments, ImageDecodeLimiter,
        PENDING_ATTACHMENT_CLEANUP_INTERVAL_SECONDS,
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
        let state = Self::build(config, true).await?;
        spawn_memory_capture_worker(state.clone());
        Ok(state)
    }

    #[cfg(test)]
    pub(crate) async fn new_without_memory_worker_for_test(
        config: Config,
    ) -> Result<Self, sqlx::Error> {
        Self::build(config, false).await
    }

    async fn build(config: Config, spawn_guest_cleanup: bool) -> Result<Self, sqlx::Error> {
        let store = ChatStore::connect(&config.database_url).await?;
        spawn_pending_attachment_cleanup(config.clone(), store.clone());
        if spawn_guest_cleanup {
            spawn_guest_session_cleanup(store.clone());
        }
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

        Ok(Self {
            config,
            http,
            rate_limiter,
            generation_limiter,
            image_decode_limiter,
            store,
            cafe: CafeHub::default(),
            memory_telemetry: MemoryTelemetry::default(),
        })
    }
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

fn spawn_pending_attachment_cleanup(config: Config, store: ChatStore) {
    tokio::spawn(async move {
        loop {
            let cleaned_count = cleanup_stale_pending_chat_attachments(&config, &store).await;
            if cleaned_count > 0 {
                tracing::info!(
                    cleaned_count,
                    "cleaned stale pending chat image attachments"
                );
            }

            sleep(Duration::from_secs(
                PENDING_ATTACHMENT_CLEANUP_INTERVAL_SECONDS,
            ))
            .await;
        }
    });
}
