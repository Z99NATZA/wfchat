use axum::{extract::State, http::HeaderMap, routing::get, Json, Router};
use serde::Serialize;
use uuid::Uuid;

use crate::{
    characters,
    error::{AppError, AppResult},
    state::AppState,
    store::UserKind,
};

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

async fn list_ai_profiles(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<Json<Vec<AiProfileResponse>>> {
    require_admin_session(&state, &headers).await?;

    let character = characters::default_character();

    Ok(Json(vec![AiProfileResponse {
        id: character.ai_profile_id,
        label: character.name,
        provider: state.config.ai_provider.clone(),
        model: state.config.active_model().to_owned(),
    }]))
}

async fn provider_status(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<Json<ProviderStatusResponse>> {
    require_admin_session(&state, &headers).await?;

    Ok(Json(ProviderStatusResponse {
        active_provider: state.config.ai_provider.clone(),
        active_model: state.config.active_model().to_owned(),
    }))
}

async fn require_admin_session(state: &AppState, headers: &HeaderMap) -> AppResult<()> {
    let Some(session_id) = session_id_from_headers(headers) else {
        return Err(AppError::Forbidden);
    };
    let Some(session) = state.store.get_session(session_id).await? else {
        return Err(AppError::Forbidden);
    };

    if matches!(session.kind, UserKind::Admin) {
        Ok(())
    } else {
        Err(AppError::Forbidden)
    }
}

fn session_id_from_headers(headers: &HeaderMap) -> Option<Uuid> {
    headers
        .get("x-wfchat-session")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| Uuid::parse_str(value).ok())
        .or_else(|| session_id_from_cookie(headers))
}

fn session_id_from_cookie(headers: &HeaderMap) -> Option<Uuid> {
    headers
        .get(axum::http::header::COOKIE)
        .and_then(|value| value.to_str().ok())
        .and_then(|cookies| {
            cookies.split(';').find_map(|cookie| {
                let (name, value) = cookie.trim().split_once('=')?;
                (name == "wfchat_session")
                    .then(|| Uuid::parse_str(value).ok())
                    .flatten()
            })
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::{to_bytes, Body},
        http::{Request, StatusCode},
    };
    use serde_json::Value;
    use tower::ServiceExt;

    use crate::{app::build_router, config::Config};

    async fn test_state() -> Option<AppState> {
        let database_url = std::env::var("WFCHAT_TEST_DATABASE_URL").ok()?;
        AppState::new(Config {
            app_host: "127.0.0.1".to_owned(),
            app_port: 0,
            frontend_origin: "http://localhost:5173".to_owned(),
            ai_provider: "mock".to_owned(),
            ai_voice_provider: "disabled".to_owned(),
            ai_voice_model: "gpt-4o-mini-tts".to_owned(),
            ai_voice_id: "marin".to_owned(),
            ai_voice_format: "mp3".to_owned(),
            ai_voice_instructions: None,
            ai_voice_speech_text_policy: "original".to_owned(),
            ai_transcription_provider: "disabled".to_owned(),
            ai_transcription_model: "gpt-4o-mini-transcribe".to_owned(),
            ai_transcription_prompt: None,
            database_url,
            openai_api_key: None,
            openai_base_url: "https://api.openai.com/v1".to_owned(),
            openai_model: "gpt-4.1-mini".to_owned(),
            lmstudio_base_url: "http://localhost:1234/v1".to_owned(),
            lmstudio_model: "local-model".to_owned(),
            xai_api_key: None,
            xai_base_url: "https://api.x.ai/v1".to_owned(),
            xai_model: "grok-3-mini".to_owned(),
            voicevox_base_url: "http://localhost:50021".to_owned(),
            voicevox_speaker_id: "".to_owned(),
            voicevox_credit: None,
            voicevox_speed_scale: None,
            voicevox_pitch_scale: None,
            voicevox_intonation_scale: None,
            voicevox_volume_scale: None,
            voicevox_pre_phoneme_length: None,
            voicevox_post_phoneme_length: None,
            google_client_id: None,
            chat_attachment_upload_dir: "data/uploads".to_owned(),
            chat_attachment_max_bytes: 10 * 1024 * 1024,
            chat_attachment_max_images_per_message: 4,
            chat_attachment_max_width: 8192,
            chat_attachment_max_height: 8192,
            chat_attachment_max_pixels: 20_000_000,
        })
        .await
        .ok()
    }

    async fn get_admin_profiles(
        state: AppState,
        session_id: Option<Uuid>,
    ) -> axum::response::Response {
        let app = build_router(state);
        let mut request = Request::builder()
            .method("GET")
            .uri("/api/admin/ai-profiles");
        if let Some(session_id) = session_id {
            request = request.header("x-wfchat-session", session_id.to_string());
        }

        app.oneshot(request.body(Body::empty()).expect("request should build"))
            .await
            .expect("request should run")
    }

    #[tokio::test]
    async fn admin_routes_reject_missing_session() {
        let Some(state) = test_state().await else {
            return;
        };

        let response = get_admin_profiles(state, None).await;

        assert_eq!(response.status(), StatusCode::FORBIDDEN);
    }

    #[tokio::test]
    async fn admin_routes_reject_guest_session() {
        let Some(state) = test_state().await else {
            return;
        };
        let session = state
            .store
            .create_guest_session()
            .await
            .expect("guest session should create");

        let response = get_admin_profiles(state, Some(session.id)).await;

        assert_eq!(response.status(), StatusCode::FORBIDDEN);
    }

    #[tokio::test]
    async fn admin_routes_reject_registered_session() {
        let Some(state) = test_state().await else {
            return;
        };
        let session = state
            .store
            .create_guest_session()
            .await
            .expect("guest session should create");
        let session = state
            .store
            .promote_session_to_registered(session.id, Uuid::new_v4())
            .await
            .expect("session promotion should query")
            .expect("session should promote");

        let response = get_admin_profiles(state, Some(session.id)).await;

        assert_eq!(response.status(), StatusCode::FORBIDDEN);
    }

    #[tokio::test]
    async fn admin_routes_allow_admin_session() {
        let Some(state) = test_state().await else {
            return;
        };
        let session = state
            .store
            .create_guest_session()
            .await
            .expect("guest session should create");
        let session = state
            .store
            .promote_session_to_admin_for_test(session.id, Uuid::new_v4())
            .await
            .expect("session promotion should query")
            .expect("session should promote to admin");

        let response = get_admin_profiles(state, Some(session.id)).await;

        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("body should collect");
        let profiles: Value = serde_json::from_slice(&body).expect("body should be json");
        assert_eq!(profiles[0]["id"], "aiko_default");
    }
}
