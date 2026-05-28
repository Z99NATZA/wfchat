use std::net::SocketAddr;

use tokio::net::TcpListener;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};
use wfchat_api::{app::build_router, config::Config, state::AppState};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenvy::dotenv().ok();
    dotenvy::from_path("apps/api/.env").ok();

    tracing_subscriber::registry()
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")))
        .with(tracing_subscriber::fmt::layer())
        .init();

    let config = Config::from_env();
    let addr: SocketAddr = config.bind_addr()?;
    let state = AppState::new(config).await;
    let app = build_router(state);
    let listener = TcpListener::bind(addr).await?;

    tracing::info!(%addr, "wfchat api listening");
    axum::serve(listener, app).await?;

    Ok(())
}
