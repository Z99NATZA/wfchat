use axum::{
    http::{header::CONTENT_TYPE, HeaderName, HeaderValue, Method},
    routing::get,
    Json, Router,
};
use serde::Serialize;
use tower_http::{cors::CorsLayer, trace::TraceLayer};

use crate::{admin, auth, characters, chat, state::AppState};

pub fn build_router(state: AppState) -> Router {
    let frontend_origin = state
        .config
        .frontend_origin
        .parse::<HeaderValue>()
        .unwrap_or_else(|_| HeaderValue::from_static("http://localhost:5173"));
    let cors = CorsLayer::new()
        .allow_origin(frontend_origin)
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PATCH,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers([CONTENT_TYPE, HeaderName::from_static("x-wfchat-session")])
        .allow_credentials(true);
    let api = Router::new()
        .route("/health", get(health))
        .merge(auth::router())
        .merge(characters::router())
        .merge(chat::router())
        .nest("/admin", admin::router());

    Router::new()
        .nest("/api", api)
        .layer(TraceLayer::new_for_http())
        .layer(cors)
        .with_state(state)
}

#[derive(Serialize)]
struct HealthResponse {
    status: &'static str,
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse { status: "ok" })
}
