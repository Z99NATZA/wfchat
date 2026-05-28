use axum::{extract::State, routing::get, Json, Router};
use serde::Serialize;

use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/ai-profiles", get(list_ai_profiles))
        .route("/ai-providers/status", get(provider_status))
}

#[derive(Serialize)]
struct AiProfileResponse {
    id: &'static str,
    label: &'static str,
    provider: String,
    model: String,
}

#[derive(Serialize)]
struct ProviderStatusResponse {
    active_provider: String,
    active_model: String,
}

async fn list_ai_profiles(State(state): State<AppState>) -> Json<Vec<AiProfileResponse>> {
    Json(vec![AiProfileResponse {
        id: "default_waifu",
        label: "Default Waifu",
        provider: state.config.ai_provider.clone(),
        model: state.config.active_model().to_owned(),
    }])
}

async fn provider_status(State(state): State<AppState>) -> Json<ProviderStatusResponse> {
    Json(ProviderStatusResponse {
        active_provider: state.config.ai_provider.clone(),
        active_model: state.config.active_model().to_owned(),
    })
}
