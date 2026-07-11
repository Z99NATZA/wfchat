use axum::{
    http::{header::CONTENT_TYPE, HeaderName, HeaderValue, Method},
    routing::get,
    Json, Router,
};
use serde::Serialize;
use tower_http::{
    cors::{AllowOrigin, CorsLayer},
    trace::TraceLayer,
};

use crate::{admin, auth, characters, chat, memory, state::AppState, sync};

pub fn build_router(state: AppState) -> Router {
    let frontend_origins = parse_frontend_origins(&state.config.frontend_origin);
    let cors = CorsLayer::new()
        .allow_origin(AllowOrigin::list(frontend_origins))
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
        .merge(memory::router())
        .merge(sync::router())
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

fn parse_frontend_origins(frontend_origin: &str) -> Vec<HeaderValue> {
    let origins = frontend_origin
        .split(',')
        .filter_map(|origin| origin.trim().parse::<HeaderValue>().ok())
        .collect::<Vec<_>>();

    if origins.is_empty() {
        vec![HeaderValue::from_static("http://localhost:5173")]
    } else {
        origins
    }
}
