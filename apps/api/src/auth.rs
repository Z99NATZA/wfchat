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
