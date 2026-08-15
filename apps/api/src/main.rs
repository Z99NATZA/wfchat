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
        .with(
            tracing_subscriber::fmt::layer()
                .json()
                .flatten_event(true)
                .with_current_span(false)
                .with_span_list(false),
        )
        .init();

    let config = Config::from_env().map_err(|error| {
        std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            format!("config error: {error}"),
        )
    })?;
    let addr: SocketAddr = config.bind_addr()?;
    let state = AppState::new(config).await.map_err(|error| {
        std::io::Error::new(
            std::io::ErrorKind::ConnectionRefused,
            format!("database connection error: {error}"),
        )
    })?;
    let app = build_router(state);
    let listener = TcpListener::bind(addr).await?;

    tracing::info!(%addr, "wfchat api listening");
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .await?;

    Ok(())
}
