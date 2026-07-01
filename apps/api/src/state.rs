use reqwest::Client;
use tokio::time::{sleep, Duration};

use crate::{
    attachments::{
        cleanup_stale_pending_chat_attachments, PENDING_ATTACHMENT_CLEANUP_INTERVAL_SECONDS,
    },
    config::Config,
    store::ChatStore,
};

#[derive(Clone)]
pub struct AppState {
    pub config: Config,
    pub http: Client,
    pub store: ChatStore,
}

impl AppState {
    pub async fn new(config: Config) -> Result<Self, sqlx::Error> {
        let store = ChatStore::connect(&config.database_url).await?;
        spawn_pending_attachment_cleanup(config.clone(), store.clone());

        Ok(Self {
            config,
            http: Client::new(),
            store,
        })
    }
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
