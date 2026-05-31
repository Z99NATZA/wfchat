use reqwest::Client;

use crate::{config::Config, store::ChatStore};

#[derive(Clone)]
pub struct AppState {
    pub config: Config,
    pub http: Client,
    pub store: ChatStore,
}

impl AppState {
    pub async fn new(config: Config) -> Result<Self, sqlx::Error> {
        let store = ChatStore::connect(&config.database_url).await?;

        Ok(Self {
            config,
            http: Client::new(),
            store,
        })
    }
}
