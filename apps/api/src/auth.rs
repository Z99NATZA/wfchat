use axum::{
    extract::{ConnectInfo, State},
    http::{header::SET_COOKIE, HeaderMap, HeaderValue, StatusCode},
    middleware,
    routing::{get, patch, post},
    Json, Router,
};
use reqwest::Url;
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use uuid::Uuid;

use crate::{
    auth_log::{self, AuthRejectionReason},
    error::{AppError, AppResult},
    rate_limit::{RateLimitFamily, RateLimitIdentity},
    session::{session_cookie, session_id_from_headers},
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
        .layer(middleware::from_fn(auth_log::request_context))
}

#[derive(Deserialize, Serialize)]
struct SessionResponse {
    user_id: Uuid,
    session_id: Uuid,
    kind: String,
    email: Option<String>,
    name: Option<String>,
    profile: Option<UserProfileResponse>,
}

#[derive(Deserialize, Serialize)]
struct UserProfileResponse {
    display_name: String,
    avatar_url: Option<String>,
}

async fn create_guest_session(
    ConnectInfo(peer_addr): ConnectInfo<SocketAddr>,
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<(HeaderMap, Json<SessionResponse>)> {
    enforce_guest_rate_limit(&state, &headers, peer_addr)?;
    let session = state.store.create_guest_session().await?;
    let mut headers = HeaderMap::new();
    let cookie = session_cookie(&state.config, session.id);

    if let Ok(value) = HeaderValue::from_str(&cookie) {
        headers.insert(SET_COOKIE, value);
    }

    auth_log::guest_created(StatusCode::OK);

    Ok((
        headers,
        Json(SessionResponse {
            user_id: session.user_id,
            session_id: session.id,
            kind: user_kind_label(&session.kind).to_owned(),
            email: None,
            name: None,
            profile: None,
        }),
    ))
}

async fn current_user(
    ConnectInfo(peer_addr): ConnectInfo<SocketAddr>,
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<(HeaderMap, Json<SessionResponse>)> {
    let session = match session_id_from_headers(&state.config, &headers) {
        Some(session_id) => state.store.get_session(session_id).await?,
        None => None,
    };
    let (session, created_guest) = match session {
        Some(session) => (session, false),
        None => {
            enforce_guest_rate_limit(&state, &headers, peer_addr)?;
            (state.store.create_guest_session().await?, true)
        }
    };
    if !matches!(&session.kind, UserKind::Guest) {
        state
            .store
            .migrate_session_data_to_user(session.id, session.user_id)
            .await?;
    }

    let mut response_headers = HeaderMap::new();
    let cookie = session_cookie(&state.config, session.id);
    if let Ok(value) = HeaderValue::from_str(&cookie) {
        response_headers.insert(SET_COOKIE, value);
    }

    let response = (
        response_headers,
        Json(session_response(&state, &session).await?),
    );
    if created_guest {
        auth_log::guest_created(StatusCode::OK);
    }
    Ok(response)
}

fn enforce_guest_rate_limit(
    state: &AppState,
    headers: &HeaderMap,
    peer_addr: SocketAddr,
) -> AppResult<()> {
    let identities = RateLimitIdentity::for_resolved_ip(
        headers,
        peer_addr.ip(),
        state.config.security.trust_proxy_headers,
        &state.config.security.trusted_proxy_cidrs,
        true,
    );
    state
        .rate_limiter
        .check_many(RateLimitFamily::GuestSessions, identities)
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
        auth_log::login_rejected(StatusCode::BAD_REQUEST, AuthRejectionReason::InvalidRequest);
        return Err(AppError::BadRequest("id_token is required".to_owned()));
    }
    let Some(client_id) = state.config.google_client_id.as_deref() else {
        auth_log::login_rejected(StatusCode::BAD_REQUEST, AuthRejectionReason::NotConfigured);
        return Err(AppError::BadRequest(
            "GOOGLE_CLIENT_ID is not configured".to_owned(),
        ));
    };
    let Some(session_id) = session_id_from_headers(&state.config, &headers) else {
        auth_log::login_rejected(StatusCode::FORBIDDEN, AuthRejectionReason::MissingSession);
        return Err(AppError::Forbidden);
    };
    let Some(session) = state.store.get_session(session_id).await? else {
        auth_log::login_rejected(StatusCode::FORBIDDEN, AuthRejectionReason::InvalidSession);
        return Err(AppError::Forbidden);
    };
    if !matches!(session.kind, UserKind::Guest) {
        auth_log::login_rejected(StatusCode::FORBIDDEN, AuthRejectionReason::WrongSessionKind);
        return Err(AppError::Forbidden);
    }

    let token_info = match verify_google_id_token(&state, &payload.id_token, client_id).await {
        Ok(token_info) => token_info,
        Err(error @ (AppError::BadRequest(_) | AppError::Forbidden)) => {
            let status = if matches!(error, AppError::Forbidden) {
                StatusCode::FORBIDDEN
            } else {
                StatusCode::BAD_REQUEST
            };
            auth_log::login_rejected(status, AuthRejectionReason::ProviderRejected);
            return Err(error);
        }
        Err(error) => return Err(error),
    };
    promote_with_google_token_info(state, headers, token_info).await
}

async fn promote_with_google_token_info(
    state: AppState,
    headers: HeaderMap,
    token_info: GoogleTokenInfoResponse,
) -> AppResult<(HeaderMap, Json<SessionResponse>)> {
    let promoted_user_id = Uuid::new_v5(&Uuid::NAMESPACE_OID, token_info.sub.as_bytes());
    let Some(session_id) = session_id_from_headers(&state.config, &headers) else {
        auth_log::login_rejected(StatusCode::FORBIDDEN, AuthRejectionReason::MissingSession);
        return Err(AppError::Forbidden);
    };
    let rotated = state
        .store
        .promote_guest_session_with_google(
            session_id,
            promoted_user_id,
            &token_info.sub,
            token_info.email,
            token_info.name,
            token_info.picture,
        )
        .await?;
    let Some(rotated) = rotated else {
        auth_log::login_rejected(
            StatusCode::BAD_REQUEST,
            AuthRejectionReason::StateTransitionRejected,
        );
        return Err(AppError::BadRequest("could not promote session".to_owned()));
    };

    let mut response_headers = HeaderMap::new();
    let cookie = session_cookie(&state.config, rotated.id);
    if let Ok(value) = HeaderValue::from_str(&cookie) {
        response_headers.insert(SET_COOKIE, value);
    }

    let response = (
        response_headers,
        Json(session_response(&state, &rotated).await?),
    );
    auth_log::login_succeeded(StatusCode::OK);
    Ok(response)
}

async fn logout(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> AppResult<(HeaderMap, Json<SessionResponse>)> {
    let Some(session_id) = session_id_from_headers(&state.config, &headers) else {
        auth_log::logout_rejected(StatusCode::FORBIDDEN, AuthRejectionReason::MissingSession);
        return Err(AppError::Forbidden);
    };
    let guest = state
        .store
        .logout_registered_session_to_guest(session_id)
        .await?;
    let Some(guest) = guest else {
        auth_log::logout_rejected(
            StatusCode::FORBIDDEN,
            AuthRejectionReason::StateTransitionRejected,
        );
        return Err(AppError::Forbidden);
    };
    let mut headers = HeaderMap::new();
    let cookie = session_cookie(&state.config, guest.id);
    if let Ok(value) = HeaderValue::from_str(&cookie) {
        headers.insert(SET_COOKIE, value);
    }

    let response = (
        headers,
        Json(SessionResponse {
            user_id: guest.user_id,
            session_id: guest.id,
            kind: user_kind_label(&guest.kind).to_owned(),
            email: None,
            name: None,
            profile: None,
        }),
    );
    auth_log::logout_succeeded(StatusCode::OK);
    Ok(response)
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
    let Some(session_id) = session_id_from_headers(&state.config, &headers) else {
        auth_log::profile_update_rejected(
            StatusCode::FORBIDDEN,
            AuthRejectionReason::MissingSession,
        );
        return Err(AppError::Forbidden);
    };
    let Some(session) = state.store.get_session(session_id).await? else {
        auth_log::profile_update_rejected(
            StatusCode::FORBIDDEN,
            AuthRejectionReason::InvalidSession,
        );
        return Err(AppError::Forbidden);
    };
    if matches!(&session.kind, UserKind::Guest) {
        auth_log::profile_update_rejected(
            StatusCode::FORBIDDEN,
            AuthRejectionReason::WrongSessionKind,
        );
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
    let avatar_url = validate_profile_avatar_url(payload.avatar_url)?;

    state
        .store
        .ensure_user_profile(session.user_id, None, None)
        .await?;
    state
        .store
        .update_user_profile(session.user_id, payload.display_name, avatar_url)
        .await?
        .ok_or_else(|| AppError::BadRequest("could not update profile".to_owned()))?;

    let response = session_response(&state, &session).await?;
    auth_log::profile_update_succeeded(StatusCode::OK);
    Ok(Json(response))
}

fn validate_profile_avatar_url(avatar_url: Option<String>) -> AppResult<Option<String>> {
    let Some(avatar_url) = avatar_url else {
        return Ok(None);
    };
    let trimmed = avatar_url.trim();
    if trimmed.is_empty() {
        return Err(AppError::BadRequest(
            "avatar_url must be a valid http(s) URL".to_owned(),
        ));
    }

    let parsed = Url::parse(trimmed)
        .map_err(|_| AppError::BadRequest("avatar_url must be a valid http(s) URL".to_owned()))?;
    match parsed.scheme() {
        "https" => Ok(Some(trimmed.to_owned())),
        "http" if is_local_avatar_host(parsed.host_str()) => Ok(Some(trimmed.to_owned())),
        _ => Err(AppError::BadRequest(
            "avatar_url must use https, or http for localhost".to_owned(),
        )),
    }
}

fn is_local_avatar_host(host: Option<&str>) -> bool {
    let Some(host) = host else {
        return false;
    };
    let normalized_host = host.to_ascii_lowercase();
    if normalized_host == "localhost" || normalized_host.ends_with(".localhost") {
        return true;
    }
    host.parse::<std::net::IpAddr>()
        .is_ok_and(|address| address.is_loopback())
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
) -> AppResult<SessionResponse> {
    if matches!(&session.kind, UserKind::Guest) {
        return Ok(SessionResponse {
            user_id: session.user_id,
            session_id: session.id,
            kind: user_kind_label(&session.kind).to_owned(),
            email: None,
            name: None,
            profile: None,
        });
    }

    let identity = state.store.get_auth_identity(session.user_id).await?;
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
        .await?;
    let profile_response = profile.map(|record| UserProfileResponse {
        display_name: record.display_name,
        avatar_url: record.avatar_url,
    });
    let name = profile_response
        .as_ref()
        .map(|profile| profile.display_name.clone());

    Ok(SessionResponse {
        user_id: session.user_id,
        session_id: session.id,
        kind: user_kind_label(&session.kind).to_owned(),
        email: identity.and_then(|record| record.email),
        name,
        profile: profile_response,
    })
}

#[cfg(test)]
mod tests {
    use std::{
        io::{self, Write},
        sync::{Arc, Mutex},
    };

    use super::*;
    use crate::{
        app::build_router,
        config::Config,
        rate_limit::{RateLimitPolicies, RateLimitPolicy, RateLimiter},
        store::{OwnerScope, SyncEntityRecord},
    };
    use axum::{
        body::{to_bytes, Body},
        extract::State,
        http::{header, Request, StatusCode},
        response::Response,
    };
    use serde_json::{json, Value};
    use tokio::sync::Notify;
    use tower::ServiceExt;
    use tracing_subscriber::fmt::MakeWriter;

    #[derive(Clone, Default)]
    struct CapturedWriter(Arc<Mutex<Vec<u8>>>);

    impl Write for CapturedWriter {
        fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
            self.0.lock().expect("captured log lock").extend(bytes);
            Ok(bytes.len())
        }

        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }

    impl<'writer> MakeWriter<'writer> for CapturedWriter {
        type Writer = CapturedWriter;

        fn make_writer(&'writer self) -> Self::Writer {
            self.clone()
        }
    }

    impl CapturedWriter {
        fn profile_events(&self) -> Vec<Value> {
            let output = self.0.lock().expect("captured log lock").clone();
            String::from_utf8(output)
                .expect("captured logs should be UTF-8")
                .lines()
                .map(|line| serde_json::from_str(line).expect("captured log should be JSON"))
                .filter(|event: &Value| {
                    event["target"] == "wfchat::auth_security"
                        && matches!(
                            event["event"].as_str(),
                            Some("auth_profile_update_succeeded" | "auth_profile_update_rejected")
                        )
                })
                .collect()
        }
    }

    async fn capture_profile_request(
        state: AppState,
        request: Request<Body>,
    ) -> (Response, Vec<Value>) {
        let writer = CapturedWriter::default();
        let subscriber = tracing_subscriber::fmt()
            .json()
            .flatten_event(true)
            .with_current_span(false)
            .with_span_list(false)
            .with_writer(writer.clone())
            .finish();
        let _guard = tracing::subscriber::set_default(subscriber);

        let response = build_router(state)
            .oneshot(request)
            .await
            .expect("request should run");
        (response, writer.profile_events())
    }

    async fn test_state(google_client_id: Option<String>) -> Option<AppState> {
        let database_url = std::env::var("WFCHAT_TEST_DATABASE_URL").ok()?;
        let state = AppState::new_without_background_workers_for_test(Config {
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
            google_client_id,
            chat_attachment_upload_dir: "data/uploads".to_owned(),
            chat_attachment_max_bytes: 10 * 1024 * 1024,
            chat_attachment_max_images_per_message: 4,
            chat_attachment_max_width: 8192,
            chat_attachment_max_height: 8192,
            chat_attachment_max_pixels: 20_000_000,
            chat_attachment_decoder_max_alloc_bytes: 128 * 1024 * 1024,
            chat_attachment_max_concurrent_decodes: 2,
            chat_attachment_max_total_bytes_per_message: 20 * 1024 * 1024,
            chat_attachment_max_storage_bytes_per_owner: 200 * 1024 * 1024,
            security: Default::default(),
        })
        .await
        .expect("WFCHAT_TEST_DATABASE_URL should identify a reachable test database");
        Some(state)
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

    fn cookie_headers(session_id: Uuid) -> HeaderMap {
        let mut headers = HeaderMap::new();
        headers.insert(
            axum::http::header::COOKIE,
            format!("wfchat_session={session_id}")
                .parse()
                .expect("cookie should be a valid header value"),
        );
        headers
    }

    fn test_peer() -> ConnectInfo<SocketAddr> {
        ConnectInfo("127.0.0.1:3000".parse().expect("test peer should parse"))
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
    async fn current_user_resolves_cookie_session_and_refreshes_cookie() {
        let Some(state) = test_state(None).await else {
            return;
        };
        let session = state
            .store
            .create_guest_session()
            .await
            .expect("guest session should create");

        let (headers, Json(response)) =
            current_user(test_peer(), State(state), cookie_headers(session.id))
                .await
                .expect("cookie session should resolve");

        assert_eq!(response.session_id, session.id);
        let cookie = headers
            .get(SET_COOKIE)
            .expect("current user should refresh the session cookie")
            .to_str()
            .expect("set-cookie should be readable");
        assert!(cookie.contains(&format!("wfchat_session={}", session.id)));
        assert!(cookie.contains("HttpOnly"));
        assert!(cookie.contains("SameSite=Lax"));
    }

    #[tokio::test]
    async fn current_user_prefers_cookie_session_over_header_fallback() {
        let Some(state) = test_state(None).await else {
            return;
        };
        let cookie_session = state
            .store
            .create_guest_session()
            .await
            .expect("cookie session should create");
        let header_session = state
            .store
            .create_guest_session()
            .await
            .expect("header session should create");
        let mut headers = cookie_headers(cookie_session.id);
        headers.insert(
            "x-wfchat-session",
            header_session
                .id
                .to_string()
                .parse()
                .expect("session id should be a valid header value"),
        );

        let (_, Json(response)) = current_user(test_peer(), State(state), headers)
            .await
            .expect("cookie session should resolve first");

        assert_eq!(response.session_id, cookie_session.id);
    }

    #[tokio::test]
    async fn current_user_consumes_guest_buckets_only_when_it_creates_a_session() {
        let Some(mut state) = test_state(None).await else {
            return;
        };
        state.rate_limiter = RateLimiter::new(RateLimitPolicies::default().with_family_limit(
            RateLimitFamily::GuestSessions,
            RateLimitPolicy::per_minute(1),
        ));
        let existing = state
            .store
            .create_guest_session()
            .await
            .expect("existing guest should create");

        for _ in 0..2 {
            let _ = current_user(
                test_peer(),
                State(state.clone()),
                cookie_headers(existing.id),
            )
            .await
            .expect("resolving an existing session must not consume guest admission");
        }

        let (_, Json(created)) = current_user(test_peer(), State(state.clone()), HeaderMap::new())
            .await
            .expect("first missing session should be admitted");
        let error = match current_user(test_peer(), State(state.clone()), HeaderMap::new()).await {
            Ok(_) => panic!("second missing session should be rate limited"),
            Err(error) => error,
        };
        assert!(matches!(error, AppError::RateLimited));

        state
            .store
            .delete_session_for_test(existing.id)
            .await
            .unwrap();
        state
            .store
            .delete_session_for_test(created.session_id)
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn guest_admission_global_bucket_is_shared_across_resolved_ips() {
        let Some(mut state) = test_state(None).await else {
            return;
        };
        state.config.security.trust_proxy_headers = true;
        state.config.security.trusted_proxy_cidrs = vec!["127.0.0.0/8".parse().unwrap()];
        state.rate_limiter = RateLimiter::new(
            RateLimitPolicies::default()
                .with_family_limit(
                    RateLimitFamily::GuestSessions,
                    RateLimitPolicy::per_minute(10),
                )
                .with_guest_global_limit(RateLimitPolicy::per_minute(1)),
        );
        let mut first_headers = HeaderMap::new();
        first_headers.insert("x-forwarded-for", "198.51.100.10".parse().unwrap());
        let mut second_headers = HeaderMap::new();
        second_headers.insert("x-forwarded-for", "203.0.113.20".parse().unwrap());

        let (_, Json(created)) =
            create_guest_session(test_peer(), State(state.clone()), first_headers)
                .await
                .expect("first resolved IP should be admitted");
        let error =
            match create_guest_session(test_peer(), State(state.clone()), second_headers).await {
                Ok(_) => panic!("global admission bucket should reject the second IP"),
                Err(error) => error,
            };
        assert!(matches!(error, AppError::RateLimited));

        state
            .store
            .delete_session_for_test(created.session_id)
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn anonymous_guest_creation_returns_the_rate_limit_contract() {
        let Some(mut state) = test_state(None).await else {
            return;
        };
        state.rate_limiter = RateLimiter::new(RateLimitPolicies::default().with_family_limit(
            RateLimitFamily::GuestSessions,
            RateLimitPolicy::per_minute(1),
        ));
        let app = build_router(state.clone());

        let admitted = app
            .clone()
            .oneshot(
                Request::post("/api/auth/guest")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(admitted.status(), StatusCode::OK);
        let rejected = app
            .oneshot(Request::get("/api/auth/me").body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(rejected.status(), StatusCode::TOO_MANY_REQUESTS);
        assert_eq!(rejected.headers().get(header::RETRY_AFTER).unwrap(), "60");
        let body = to_bytes(rejected.into_body(), usize::MAX).await.unwrap();
        assert_eq!(body.as_ref(), br#"{"error":"too many requests"}"#);

        let admitted_body = to_bytes(admitted.into_body(), usize::MAX).await.unwrap();
        let admitted: SessionResponse = serde_json::from_slice(&admitted_body).unwrap();
        state
            .store
            .delete_session_for_test(admitted.session_id)
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn authenticated_feature_routes_do_not_create_missing_sessions() {
        let Some(state) = test_state(None).await else {
            return;
        };
        let before = state.store.auth_session_creation_count_for_test();
        let requests = [
            ("PATCH", "/api/auth/profile", r#"{}"#),
            (
                "POST",
                "/api/personas/aiko/follow-up",
                r#"{"claim_key":"00000000-0000-0000-0000-000000000001"}"#,
            ),
            ("DELETE", "/api/learned-context", ""),
            ("GET", "/api/sync/changes", ""),
            ("POST", "/api/sync/preview", r#"{"items":[]}"#),
            (
                "POST",
                "/api/sync/commit",
                r#"{"operation_id":"missing-session","items":[]}"#,
            ),
            ("GET", "/api/cafe/rooms", ""),
            ("POST", "/api/cafe/rooms", r#"{"is_private":false}"#),
            ("POST", "/api/cafe/rooms/quick-join", ""),
            (
                "POST",
                "/api/cafe/rooms/join",
                r#"{"invite_code":"ABC123"}"#,
            ),
            ("GET", "/api/cafe/progress", ""),
            (
                "POST",
                "/api/cafe/cosmetics/equipped",
                r#"{"cosmetic_id":null}"#,
            ),
            (
                "POST",
                "/api/cafe/avatars/equipped",
                r#"{"avatar_id":"boy"}"#,
            ),
        ];

        for (method, uri, body) in requests {
            let response = build_router(state.clone())
                .oneshot(
                    Request::builder()
                        .method(method)
                        .uri(uri)
                        .header(header::CONTENT_TYPE, "application/json")
                        .body(Body::from(body))
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(response.status(), StatusCode::FORBIDDEN, "{method} {uri}");
        }
        assert_eq!(state.store.auth_session_creation_count_for_test(), before);
    }

    #[tokio::test]
    async fn expired_session_is_not_resolved() {
        let Some(state) = test_state(None).await else {
            return;
        };
        let session = state
            .store
            .create_guest_session()
            .await
            .expect("session should create");
        state
            .store
            .expire_session_for_test(session.id)
            .await
            .expect("session should expire");

        assert!(state
            .store
            .get_session(session.id)
            .await
            .expect("expired session lookup should query")
            .is_none());
    }

    #[tokio::test]
    async fn registered_logout_rotates_once_to_a_guest_session_cookie() {
        let Some(state) = test_state(None).await else {
            return;
        };
        let old_session = state
            .store
            .create_guest_session()
            .await
            .expect("old session should create");
        let old_session = state
            .store
            .promote_session_to_registered(old_session.id, Uuid::new_v4())
            .await
            .expect("old session should promote")
            .expect("old session should remain active");
        let before = state.store.auth_session_creation_count_for_test();

        let (headers, Json(response)) =
            logout(State(state.clone()), cookie_headers(old_session.id))
                .await
                .expect("logout should create a replacement guest session");

        assert_eq!(response.kind, "guest");
        let cookie = headers
            .get(SET_COOKIE)
            .expect("logout should set a replacement session cookie")
            .to_str()
            .expect("set-cookie should be readable");
        assert!(cookie.contains(&format!("wfchat_session={}", response.session_id)));
        assert!(cookie.contains("HttpOnly"));
        assert!(cookie.contains("SameSite=Lax"));
        assert!(state
            .store
            .get_session(old_session.id)
            .await
            .expect("old session lookup should query")
            .is_none());
        assert_eq!(
            state.store.auth_session_creation_count_for_test(),
            before + 1
        );

        let repeated = logout(State(state.clone()), cookie_headers(old_session.id)).await;
        assert!(matches!(repeated, Err(AppError::Forbidden)));
        assert_eq!(
            state.store.auth_session_creation_count_for_test(),
            before + 1
        );

        let guest_logout = logout(State(state.clone()), cookie_headers(response.session_id)).await;
        assert!(matches!(guest_logout, Err(AppError::Forbidden)));
        let missing_logout = logout(State(state.clone()), HeaderMap::new()).await;
        assert!(matches!(missing_logout, Err(AppError::Forbidden)));
        state
            .store
            .delete_session_for_test(response.session_id)
            .await
            .unwrap();
        state
            .store
            .delete_session_for_test(old_session.id)
            .await
            .unwrap();
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
    async fn google_promotion_requires_an_existing_active_session() {
        let Some(state) = test_state(Some("test-client".to_owned())).await else {
            return;
        };
        let before = state.store.auth_session_creation_count_for_test();

        let result = promote_with_google_token_info(
            state.clone(),
            HeaderMap::new(),
            token_info(&format!("missing-session-{}", Uuid::new_v4())),
        )
        .await;

        assert!(matches!(result, Err(AppError::Forbidden)));
        assert_eq!(state.store.auth_session_creation_count_for_test(), before);
    }

    #[tokio::test]
    async fn google_login_rejects_missing_session_before_provider_verification() {
        let Some(state) = test_state(Some("test-client".to_owned())).await else {
            return;
        };
        let before = state.store.auth_session_creation_count_for_test();

        let result = login_with_google(
            State(state.clone()),
            HeaderMap::new(),
            Json(GoogleLoginRequest {
                id_token: "unverified-token".to_owned(),
            }),
        )
        .await;

        assert!(matches!(result, Err(AppError::Forbidden)));
        assert_eq!(state.store.auth_session_creation_count_for_test(), before);
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

    #[tokio::test(flavor = "current_thread")]
    async fn profile_route_logs_session_rejections_once_without_profile_values() {
        let Some(state) = test_state(None).await else {
            return;
        };
        let guest = state
            .store
            .create_guest_session()
            .await
            .expect("guest session should create");
        let invalid_session_id = Uuid::new_v4();
        let secret_name = "Secret Rejected Profile Name";
        let secret_avatar = "https://private.example/rejected-avatar.png";
        let body = format!(r#"{{"display_name":"{secret_name}","avatar_url":"{secret_avatar}"}}"#);

        for (cookie, reason, excluded_session_id) in [
            (None, "missing_session", None),
            (
                Some(format!("wfchat_session={invalid_session_id}")),
                "invalid_session",
                Some(invalid_session_id),
            ),
            (
                Some(format!("wfchat_session={}", guest.id)),
                "wrong_session_kind",
                Some(guest.id),
            ),
        ] {
            let mut builder = Request::patch("/api/auth/profile")
                .header(header::CONTENT_TYPE, "application/json");
            if let Some(cookie) = cookie {
                builder = builder.header(header::COOKIE, cookie);
            }
            let (response, events) = capture_profile_request(
                state.clone(),
                builder
                    .body(Body::from(body.clone()))
                    .expect("request should build"),
            )
            .await;

            assert_eq!(response.status(), StatusCode::FORBIDDEN);
            assert_eq!(events.len(), 1);
            let event = &events[0];
            assert_eq!(event["level"], "WARN");
            assert_eq!(event["event"], "auth_profile_update_rejected");
            assert_eq!(event["outcome"], "rejected");
            assert_eq!(event["status"], 403);
            assert_eq!(event["reason"], reason);
            assert_eq!(
                event["request_id"],
                response
                    .headers()
                    .get("x-request-id")
                    .expect("request id response header")
                    .to_str()
                    .expect("request id should be text")
            );

            let encoded = serde_json::to_string(event).expect("event should serialize");
            assert!(!encoded.contains(secret_name));
            assert!(!encoded.contains(secret_avatar));
            if let Some(session_id) = excluded_session_id {
                assert!(!encoded.contains(&session_id.to_string()));
            }
        }

        state
            .store
            .delete_session_for_test(guest.id)
            .await
            .expect("guest session cleanup should succeed");
    }

    #[tokio::test(flavor = "current_thread")]
    async fn profile_route_logs_success_and_input_rejections_without_sensitive_values() {
        let Some(state) = test_state(None).await else {
            return;
        };
        let guest = state
            .store
            .create_guest_session()
            .await
            .expect("guest session should create");
        let user_id = Uuid::new_v4();
        let session = state
            .store
            .promote_session_to_registered(guest.id, user_id)
            .await
            .expect("session should promote")
            .expect("promoted session should exist");
        let cookie = format!("wfchat_session={}", session.id);
        let secret_name = "Secret Successful Profile Name";
        let secret_avatar = "https://private.example/success-avatar.png";

        let (response, events) = capture_profile_request(
            state.clone(),
            Request::patch("/api/auth/profile")
                .header(header::CONTENT_TYPE, "application/json")
                .header(header::COOKIE, &cookie)
                .body(Body::from(format!(
                    r#"{{"display_name":"{secret_name}","avatar_url":"{secret_avatar}"}}"#
                )))
                .expect("request should build"),
        )
        .await;
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(events.len(), 1);
        let event = &events[0];
        assert_eq!(event["level"], "INFO");
        assert_eq!(event["event"], "auth_profile_update_succeeded");
        assert_eq!(event["outcome"], "success");
        assert_eq!(event["status"], 200);
        assert!(event.get("reason").is_none());
        assert_eq!(
            event["request_id"],
            response
                .headers()
                .get("x-request-id")
                .expect("request id response header")
                .to_str()
                .expect("request id should be text")
        );
        let encoded = serde_json::to_string(event).expect("event should serialize");
        for excluded in [
            session.id.to_string(),
            user_id.to_string(),
            secret_name.to_owned(),
            secret_avatar.to_owned(),
            "display_name".to_owned(),
            "avatar_url".to_owned(),
        ] {
            assert!(!encoded.contains(&excluded));
        }
        let response_body = to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("response body should read");
        let response: SessionResponse =
            serde_json::from_slice(&response_body).expect("response should decode");
        assert_eq!(response.name.as_deref(), Some(secret_name));
        assert_eq!(
            response
                .profile
                .as_ref()
                .and_then(|profile| profile.avatar_url.as_deref()),
            Some(secret_avatar)
        );

        for body in [
            r#"{"display_name":" ","avatar_url":null}"#,
            r#"{"display_name":"Rejected Name","avatar_url":"javascript:secret-profile-value"}"#,
            r#"{"display_name":"secret-profile-malformed""#,
        ] {
            let (response, events) = capture_profile_request(
                state.clone(),
                Request::patch("/api/auth/profile")
                    .header(header::CONTENT_TYPE, "application/json")
                    .header(header::COOKIE, &cookie)
                    .body(Body::from(body))
                    .expect("request should build"),
            )
            .await;
            assert_eq!(response.status(), StatusCode::BAD_REQUEST);
            assert_eq!(events.len(), 1);
            let event = &events[0];
            assert_eq!(event["level"], "WARN");
            assert_eq!(event["event"], "auth_profile_update_rejected");
            assert_eq!(event["outcome"], "rejected");
            assert_eq!(event["status"], 400);
            assert_eq!(event["reason"], "invalid_request");
            assert_eq!(
                event["request_id"],
                response
                    .headers()
                    .get("x-request-id")
                    .expect("request id response header")
                    .to_str()
                    .expect("request id should be text")
            );
            let encoded = serde_json::to_string(event).expect("event should serialize");
            for excluded in ["Rejected Name", "javascript:", "secret-profile-malformed"] {
                assert!(!encoded.contains(excluded));
            }
        }

        state
            .store
            .delete_session_for_test(session.id)
            .await
            .expect("registered session cleanup should succeed");
    }

    #[tokio::test]
    async fn guest_cannot_update_profile() {
        let Some(state) = test_state(None).await else {
            return;
        };
        let session = state
            .store
            .create_guest_session()
            .await
            .expect("guest session should create");

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

    #[test]
    fn profile_avatar_url_validation_accepts_https_and_local_http() {
        assert_eq!(
            validate_profile_avatar_url(Some(" https://example.com/aiko.png ".to_owned()))
                .expect("https avatar should validate"),
            Some("https://example.com/aiko.png".to_owned())
        );
        assert_eq!(
            validate_profile_avatar_url(Some("http://localhost:5173/avatar.png".to_owned()))
                .expect("localhost avatar should validate"),
            Some("http://localhost:5173/avatar.png".to_owned())
        );
        assert_eq!(
            validate_profile_avatar_url(Some("http://127.0.0.1/avatar.png".to_owned()))
                .expect("loopback avatar should validate"),
            Some("http://127.0.0.1/avatar.png".to_owned())
        );
    }

    #[test]
    fn profile_avatar_url_validation_rejects_unsafe_or_malformed_values() {
        for value in [
            " ",
            "not-a-url",
            "/images/aiko-avatar.png",
            "data:image/png;base64,AAAA",
            "javascript:alert(1)",
            "http://example.com/aiko.png",
        ] {
            let error = validate_profile_avatar_url(Some(value.to_owned()))
                .expect_err("unsafe avatar URL should fail");
            assert!(
                error.to_string().starts_with("bad request: avatar_url"),
                "unexpected error for {value:?}: {error}"
            );
        }
    }

    #[tokio::test]
    async fn registered_profile_update_validates_avatar_url_and_preserves_existing_avatar() {
        let Some(state) = test_state(None).await else {
            return;
        };
        let guest = state
            .store
            .create_guest_session()
            .await
            .expect("guest session should create");
        let user_id = Uuid::new_v4();
        let session = state
            .store
            .promote_session_to_registered(guest.id, user_id)
            .await
            .expect("session should promote")
            .expect("promoted session should exist");

        let Json(response) = update_profile(
            State(state.clone()),
            session_headers(session.id),
            Json(UpdateProfileRequest {
                display_name: Some("Profile User".to_owned()),
                avatar_url: Some(" https://example.com/custom-avatar.png ".to_owned()),
            }),
        )
        .await
        .expect("valid profile update should succeed");
        assert_eq!(response.name.as_deref(), Some("Profile User"));
        assert_eq!(
            response
                .profile
                .as_ref()
                .and_then(|profile| profile.avatar_url.as_deref()),
            Some("https://example.com/custom-avatar.png")
        );

        let Json(response) = update_profile(
            State(state),
            session_headers(session.id),
            Json(UpdateProfileRequest {
                display_name: Some("Renamed User".to_owned()),
                avatar_url: None,
            }),
        )
        .await
        .expect("profile update without avatar should preserve avatar");
        assert_eq!(response.name.as_deref(), Some("Renamed User"));
        assert_eq!(
            response
                .profile
                .as_ref()
                .and_then(|profile| profile.avatar_url.as_deref()),
            Some("https://example.com/custom-avatar.png")
        );
    }

    #[tokio::test]
    async fn registered_profile_update_rejects_unsafe_avatar_url() {
        let Some(state) = test_state(None).await else {
            return;
        };
        let guest = state
            .store
            .create_guest_session()
            .await
            .expect("guest session should create");
        let user_id = Uuid::new_v4();
        let session = state
            .store
            .promote_session_to_registered(guest.id, user_id)
            .await
            .expect("session should promote")
            .expect("promoted session should exist");

        let result = update_profile(
            State(state),
            session_headers(session.id),
            Json(UpdateProfileRequest {
                display_name: Some("Profile User".to_owned()),
                avatar_url: Some("javascript:alert(1)".to_owned()),
            }),
        )
        .await;
        let error = match result {
            Ok(_) => panic!("unsafe avatar URL should fail"),
            Err(error) => error,
        };

        assert_eq!(
            error.to_string(),
            "bad request: avatar_url must use https, or http for localhost"
        );
    }

    #[tokio::test]
    async fn google_promotion_migrates_guest_sync_data_to_registered_owner() {
        let Some(state) = test_state(Some("test-client".to_owned())).await else {
            return;
        };
        let guest = state
            .store
            .create_guest_session()
            .await
            .expect("guest session should create");
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
            .await
            .expect("sync entity should save");
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
        assert_ne!(response.session_id, guest.id);
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
        assert!(state
            .store
            .get_session(guest.id)
            .await
            .expect("guest session lookup should query")
            .is_none());

        let promoted_session = state
            .store
            .get_session(response.session_id)
            .await
            .expect("promoted session lookup should query")
            .expect("promoted session should exist");
        let promoted_owner = OwnerScope::from_session(&promoted_session);
        assert_eq!(promoted_owner.user_id, Some(response.user_id));

        let pulled = state
            .store
            .list_sync_entities_since(promoted_owner, 0, 50)
            .await
            .expect("promoted sync rows should list");
        assert!(pulled.iter().any(|item| item.item_id == item_id));
    }

    #[tokio::test]
    async fn google_promotion_keeps_locked_old_session_visibly_guest_until_commit() {
        let Some(state) = test_state(Some("test-client".to_owned())).await else {
            return;
        };
        let guest = state.store.create_guest_session().await.unwrap();
        let guest_id = guest.id;
        let guest_user_id = guest.user_id;
        let user_id = Uuid::new_v4();
        let after_lock = Arc::new(Notify::new());
        let continue_after_lock = Arc::new(Notify::new());
        let store = state.store.clone();
        let subject = format!("visibility-{}", Uuid::new_v4());
        let task_after_lock = after_lock.clone();
        let task_continue = continue_after_lock.clone();
        let task = tokio::spawn(async move {
            store
                .promote_guest_session_with_google_for_test(
                    guest_id,
                    user_id,
                    &subject,
                    task_after_lock,
                    task_continue,
                    false,
                )
                .await
        });

        after_lock.notified().await;
        let visible = state
            .store
            .get_session(guest_id)
            .await
            .unwrap()
            .expect("old session should remain visible before commit");
        assert!(matches!(visible.kind, UserKind::Guest));
        assert_eq!(visible.user_id, guest_user_id);

        continue_after_lock.notify_one();
        let replacement = task.await.unwrap().unwrap().unwrap();
        assert!(state.store.get_session(guest_id).await.unwrap().is_none());
        assert!(matches!(replacement.kind, UserKind::Registered));

        state
            .store
            .delete_session_for_test(replacement.id)
            .await
            .unwrap();
        state.store.delete_session_for_test(guest_id).await.unwrap();
    }

    #[tokio::test]
    async fn google_promotion_failure_rolls_back_migration_identity_profile_and_sessions() {
        let Some(state) = test_state(Some("test-client".to_owned())).await else {
            return;
        };
        let guest = state.store.create_guest_session().await.unwrap();
        let guest_id = guest.id;
        let guest_user_id = guest.user_id;
        let owner = OwnerScope::from_session(&guest);
        let item_id = format!("rollback-{}", Uuid::new_v4());
        state
            .store
            .upsert_sync_entity(&SyncEntityRecord {
                session_id: guest.id,
                owner_user_id: None,
                item_id: item_id.clone(),
                item_type: "setting".to_owned(),
                updated_at: 1,
                deleted_at: None,
                payload: json!({"value": true}),
            })
            .await
            .unwrap();
        let user_id = Uuid::new_v4();
        let subject = format!("rollback-{}", Uuid::new_v4());
        let after_lock = Arc::new(Notify::new());
        let continue_after_lock = Arc::new(Notify::new());
        let store = state.store.clone();
        let task_after_lock = after_lock.clone();
        let task_continue = continue_after_lock.clone();
        let task = tokio::spawn(async move {
            store
                .promote_guest_session_with_google_for_test(
                    guest_id,
                    user_id,
                    &subject,
                    task_after_lock,
                    task_continue,
                    true,
                )
                .await
        });

        after_lock.notified().await;
        continue_after_lock.notify_one();
        assert!(task.await.unwrap().is_err());

        let old = state.store.get_session(guest_id).await.unwrap().unwrap();
        assert!(matches!(old.kind, UserKind::Guest));
        assert_eq!(old.user_id, guest_user_id);
        assert!(state
            .store
            .get_auth_identity(user_id)
            .await
            .unwrap()
            .is_none());
        assert!(state
            .store
            .get_user_profile(user_id)
            .await
            .unwrap()
            .is_none());
        assert_eq!(
            state
                .store
                .count_sessions_for_user_for_test(user_id)
                .await
                .unwrap(),
            0
        );
        let guest_rows = state
            .store
            .list_sync_entities_since(owner, 0, 50)
            .await
            .unwrap();
        assert!(guest_rows.iter().any(|row| row.item_id == item_id));

        state.store.delete_session_for_test(guest_id).await.unwrap();
    }

    #[tokio::test]
    async fn concurrent_google_login_with_same_guest_session_succeeds_once() {
        let Some(state) = test_state(Some("test-client".to_owned())).await else {
            return;
        };
        let guest = state.store.create_guest_session().await.unwrap();
        let subject = format!("concurrent-{}", Uuid::new_v4());
        let first = promote_with_google_token_info(
            state.clone(),
            session_headers(guest.id),
            token_info(&subject),
        );
        let second = promote_with_google_token_info(
            state.clone(),
            session_headers(guest.id),
            token_info(&subject),
        );

        let (first, second) = tokio::join!(first, second);
        assert_eq!(usize::from(first.is_ok()) + usize::from(second.is_ok()), 1);
        assert!(state.store.get_session(guest.id).await.unwrap().is_none());

        let successful_session = first
            .ok()
            .or_else(|| second.ok())
            .map(|(_, Json(response))| response.session_id)
            .unwrap();
        state
            .store
            .delete_session_for_test(successful_session)
            .await
            .unwrap();
        state.store.delete_session_for_test(guest.id).await.unwrap();
    }
}
