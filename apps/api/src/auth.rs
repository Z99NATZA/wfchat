use axum::{
    extract::State,
    http::{header::SET_COOKIE, HeaderMap, HeaderValue},
    routing::{get, patch, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    error::{AppError, AppResult},
    state::AppState,
    store::UserKind,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/auth/guest", post(create_guest_session))
        .route("/auth/google", post(login_with_google))
        .route("/auth/logout", post(logout))
        .route("/auth/me", get(current_user))
        .route("/auth/profile", patch(update_profile))
}

#[derive(Serialize)]
struct SessionResponse {
    user_id: Uuid,
    session_id: Uuid,
    kind: String,
    email: Option<String>,
    name: Option<String>,
    profile: Option<UserProfileResponse>,
}

#[derive(Serialize)]
struct UserProfileResponse {
    display_name: String,
    avatar_url: Option<String>,
}

async fn create_guest_session(State(state): State<AppState>) -> (HeaderMap, Json<SessionResponse>) {
    let session = state.store.create_guest_session().await;
    let mut headers = HeaderMap::new();
    let cookie = format!(
        "wfchat_session={}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000",
        session.id
    );

    if let Ok(value) = HeaderValue::from_str(&cookie) {
        headers.insert(SET_COOKIE, value);
    }

    (
        headers,
        Json(SessionResponse {
            user_id: session.user_id,
            session_id: session.id,
            kind: user_kind_label(&session.kind).to_owned(),
            email: None,
            name: None,
            profile: None,
        }),
    )
}

async fn current_user(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<Json<SessionResponse>> {
    let session = state
        .store
        .ensure_session(session_id_from_headers(&headers))
        .await;
    if !matches!(&session.kind, UserKind::Guest) {
        state
            .store
            .migrate_session_data_to_user(session.id, session.user_id)
            .await;
    }

    Ok(Json(session_response(&state, &session).await))
}

#[derive(Deserialize)]
struct GoogleLoginRequest {
    id_token: String,
}

#[derive(Deserialize)]
struct GoogleTokenInfoResponse {
    aud: String,
    sub: String,
    email: Option<String>,
    name: Option<String>,
    picture: Option<String>,
}

async fn login_with_google(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<GoogleLoginRequest>,
) -> AppResult<(HeaderMap, Json<SessionResponse>)> {
    if payload.id_token.trim().is_empty() {
        return Err(AppError::BadRequest("id_token is required".to_owned()));
    }
    let client_id = state
        .config
        .google_client_id
        .as_deref()
        .ok_or_else(|| AppError::BadRequest("GOOGLE_CLIENT_ID is not configured".to_owned()))?;

    let token_info = verify_google_id_token(&state, &payload.id_token, client_id).await?;
    promote_with_google_token_info(state, headers, token_info).await
}

async fn promote_with_google_token_info(
    state: AppState,
    headers: HeaderMap,
    token_info: GoogleTokenInfoResponse,
) -> AppResult<(HeaderMap, Json<SessionResponse>)> {
    let promoted_user_id = Uuid::new_v5(&Uuid::NAMESPACE_OID, token_info.sub.as_bytes());
    let session = state
        .store
        .ensure_session(session_id_from_headers(&headers))
        .await;
    let promoted = state
        .store
        .promote_session_to_registered(session.id, promoted_user_id)
        .await
        .ok_or_else(|| AppError::BadRequest("could not promote session".to_owned()))?;
    state
        .store
        .migrate_session_data_to_user(promoted.id, promoted.user_id)
        .await;
    state
        .store
        .upsert_auth_identity(
            promoted.user_id,
            "google",
            &token_info.sub,
            token_info.email,
            token_info.name.clone(),
            token_info.picture.clone(),
        )
        .await;
    state
        .store
        .ensure_user_profile(promoted.user_id, token_info.name, token_info.picture)
        .await;

    let mut response_headers = HeaderMap::new();
    let cookie = format!(
        "wfchat_session={}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000",
        promoted.id
    );
    if let Ok(value) = HeaderValue::from_str(&cookie) {
        response_headers.insert(SET_COOKIE, value);
    }

    Ok((
        response_headers,
        Json(session_response(&state, &promoted).await),
    ))
}

async fn logout(State(state): State<AppState>) -> (HeaderMap, Json<SessionResponse>) {
    let guest = state.store.create_guest_session().await;
    let mut headers = HeaderMap::new();
    let cookie = format!(
        "wfchat_session={}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000",
        guest.id
    );
    if let Ok(value) = HeaderValue::from_str(&cookie) {
        headers.insert(SET_COOKIE, value);
    }

    (
        headers,
        Json(SessionResponse {
            user_id: guest.user_id,
            session_id: guest.id,
            kind: user_kind_label(&guest.kind).to_owned(),
            email: None,
            name: None,
            profile: None,
        }),
    )
}

#[derive(Deserialize)]
struct UpdateProfileRequest {
    display_name: Option<String>,
    avatar_url: Option<String>,
}

async fn update_profile(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<UpdateProfileRequest>,
) -> AppResult<Json<SessionResponse>> {
    let session = state
        .store
        .ensure_session(session_id_from_headers(&headers))
        .await;
    if matches!(&session.kind, UserKind::Guest) {
        return Err(AppError::Forbidden);
    }

    if payload
        .display_name
        .as_deref()
        .is_some_and(|value| value.trim().is_empty())
    {
        return Err(AppError::BadRequest(
            "display_name must not be empty".to_owned(),
        ));
    }

    state
        .store
        .ensure_user_profile(session.user_id, None, None)
        .await;
    state
        .store
        .update_user_profile(session.user_id, payload.display_name, payload.avatar_url)
        .await
        .ok_or_else(|| AppError::BadRequest("could not update profile".to_owned()))?;

    Ok(Json(session_response(&state, &session).await))
}

async fn verify_google_id_token(
    state: &AppState,
    id_token: &str,
    expected_client_id: &str,
) -> AppResult<GoogleTokenInfoResponse> {
    let response = state
        .http
        .get("https://oauth2.googleapis.com/tokeninfo")
        .query(&[("id_token", id_token)])
        .send()
        .await
        .map_err(|_| AppError::BadRequest("could not verify google token".to_owned()))?;
    if !response.status().is_success() {
        return Err(AppError::BadRequest("google token is invalid".to_owned()));
    }
    let token_info = response
        .json::<GoogleTokenInfoResponse>()
        .await
        .map_err(|_| AppError::BadRequest("google token response is invalid".to_owned()))?;

    if token_info.aud != expected_client_id {
        return Err(AppError::Forbidden);
    }

    Ok(token_info)
}

fn session_id_from_headers(headers: &HeaderMap) -> Option<Uuid> {
    headers
        .get("x-wfchat-session")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| Uuid::parse_str(value).ok())
}

fn user_kind_label(kind: &UserKind) -> &'static str {
    match kind {
        UserKind::Guest => "guest",
        UserKind::Registered => "registered",
        UserKind::Admin => "admin",
    }
}

async fn session_response(
    state: &AppState,
    session: &crate::store::SessionRecord,
) -> SessionResponse {
    if matches!(&session.kind, UserKind::Guest) {
        return SessionResponse {
            user_id: session.user_id,
            session_id: session.id,
            kind: user_kind_label(&session.kind).to_owned(),
            email: None,
            name: None,
            profile: None,
        };
    }

    let identity = state.store.get_auth_identity(session.user_id).await;
    let profile = state
        .store
        .ensure_user_profile(
            session.user_id,
            identity
                .as_ref()
                .and_then(|record| record.provider_name.clone()),
            identity
                .as_ref()
                .and_then(|record| record.provider_avatar_url.clone()),
        )
        .await;
    let profile_response = profile.map(|record| UserProfileResponse {
        display_name: record.display_name,
        avatar_url: record.avatar_url,
    });
    let name = profile_response
        .as_ref()
        .map(|profile| profile.display_name.clone());

    SessionResponse {
        user_id: session.user_id,
        session_id: session.id,
        kind: user_kind_label(&session.kind).to_owned(),
        email: identity.and_then(|record| record.email),
        name,
        profile: profile_response,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        config::Config,
        store::{OwnerScope, SyncEntityRecord},
    };
    use axum::extract::State;
    use serde_json::json;

    async fn test_state(google_client_id: Option<String>) -> Option<AppState> {
        let database_url = std::env::var("WFCHAT_TEST_DATABASE_URL").ok()?;
        AppState::new(Config {
            app_host: "127.0.0.1".to_owned(),
            app_port: 0,
            frontend_origin: "http://localhost:5173".to_owned(),
            ai_provider: "mock".to_owned(),
            ai_model: "mock-waifu".to_owned(),
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
            google_client_id,
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

    fn session_headers(session_id: Uuid) -> HeaderMap {
        let mut headers = HeaderMap::new();
        headers.insert(
            "x-wfchat-session",
            session_id
                .to_string()
                .parse()
                .expect("session id should be a valid header value"),
        );
        headers
    }

    fn token_info(subject: &str) -> GoogleTokenInfoResponse {
        GoogleTokenInfoResponse {
            aud: "test-client".to_owned(),
            sub: subject.to_owned(),
            email: Some(format!("{subject}@example.com")),
            name: Some("Google User".to_owned()),
            picture: Some("https://example.com/google.png".to_owned()),
        }
    }

    #[tokio::test]
    async fn google_login_requires_non_empty_id_token() {
        let Some(state) = test_state(Some("test-client".to_owned())).await else {
            return;
        };

        let result = login_with_google(
            State(state),
            HeaderMap::new(),
            Json(GoogleLoginRequest {
                id_token: " ".to_owned(),
            }),
        )
        .await;
        let error = match result {
            Ok(_) => panic!("blank id token should fail"),
            Err(error) => error,
        };

        assert_eq!(error.to_string(), "bad request: id_token is required");
    }

    #[tokio::test]
    async fn google_login_requires_client_id_config() {
        let Some(state) = test_state(None).await else {
            return;
        };

        let result = login_with_google(
            State(state),
            HeaderMap::new(),
            Json(GoogleLoginRequest {
                id_token: "token".to_owned(),
            }),
        )
        .await;
        let error = match result {
            Ok(_) => panic!("missing google client id should fail before remote verify"),
            Err(error) => error,
        };

        assert_eq!(
            error.to_string(),
            "bad request: GOOGLE_CLIENT_ID is not configured"
        );
    }

    #[tokio::test]
    async fn guest_cannot_update_profile() {
        let Some(state) = test_state(None).await else {
            return;
        };
        let session = state.store.create_guest_session().await;

        let result = update_profile(
            State(state),
            session_headers(session.id),
            Json(UpdateProfileRequest {
                display_name: Some("Guest".to_owned()),
                avatar_url: None,
            }),
        )
        .await;
        let error = match result {
            Ok(_) => panic!("guest profile update should be forbidden"),
            Err(error) => error,
        };

        assert_eq!(error.to_string(), "forbidden");
    }

    #[tokio::test]
    async fn google_promotion_migrates_guest_sync_data_to_registered_owner() {
        let Some(state) = test_state(Some("test-client".to_owned())).await else {
            return;
        };
        let guest = state.store.create_guest_session().await;
        let guest_owner = OwnerScope::from_session(&guest);
        let item_id = format!("settings.theme.{}", Uuid::new_v4());
        let saved = state
            .store
            .upsert_sync_entity(&SyncEntityRecord {
                session_id: guest.id,
                owner_user_id: guest_owner.user_id,
                item_id: item_id.clone(),
                item_type: "setting".to_owned(),
                updated_at: 101,
                deleted_at: None,
                payload: json!({ "key": "theme", "value": "dark" }),
            })
            .await;
        assert!(saved);

        let subject = format!("google-subject-{}", Uuid::new_v4());
        let (headers, Json(response)) = promote_with_google_token_info(
            state.clone(),
            session_headers(guest.id),
            token_info(&subject),
        )
        .await
        .expect("google promotion should succeed");

        assert_eq!(response.kind, "registered");
        assert_eq!(
            response.email.as_deref(),
            Some(format!("{subject}@example.com").as_str())
        );
        assert_eq!(response.name.as_deref(), Some("Google User"));
        assert_eq!(
            response
                .profile
                .as_ref()
                .map(|profile| profile.display_name.as_str()),
            Some("Google User")
        );
        assert!(headers.get(SET_COOKIE).is_some());

        let promoted_session = state
            .store
            .get_session(response.session_id)
            .await
            .expect("promoted session should exist");
        let promoted_owner = OwnerScope::from_session(&promoted_session);
        assert_eq!(promoted_owner.user_id, Some(response.user_id));

        let pulled = state
            .store
            .list_sync_entities_since(promoted_owner, 0, 50)
            .await;
        assert!(pulled.iter().any(|item| item.item_id == item_id));
    }
}
