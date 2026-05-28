use reqwest::Client;

use crate::{config::Config, store::ChatStore};

#[derive(Clone)]
pub struct AppState {
    pub config: Config,
    pub http: Client,
    pub store: ChatStore,
}

impl AppState {
    pub async fn new(config: Config) -> Self {
        let store = ChatStore::load(&config.data_path).await;

        Self {
            config,
            http: Client::new(),
            store,
        }
    }
}
