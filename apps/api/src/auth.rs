use axum::{
    extract::State,
    http::{header::SET_COOKIE, HeaderMap, HeaderValue},
    routing::{get, post},
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
}

#[derive(Serialize)]
struct SessionResponse {
    user_id: Uuid,
    session_id: Uuid,
    kind: String,
    email: Option<String>,
    name: Option<String>,
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
        }),
    )
}

async fn current_user(State(state): State<AppState>, headers: HeaderMap) -> Json<SessionResponse> {
    let session = state
        .store
        .ensure_session(session_id_from_headers(&headers))
        .await;

    Json(SessionResponse {
        user_id: session.user_id,
        session_id: session.id,
        kind: user_kind_label(&session.kind).to_owned(),
        email: None,
        name: None,
    })
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
        Json(SessionResponse {
            user_id: promoted.user_id,
            session_id: promoted.id,
            kind: user_kind_label(&promoted.kind).to_owned(),
            email: token_info.email,
            name: token_info.name,
        }),
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
        }),
    )
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
