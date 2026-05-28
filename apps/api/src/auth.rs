use axum::{
    extract::State,
    http::{header::SET_COOKIE, HeaderMap, HeaderValue},
    routing::{get, post},
    Json, Router,
};
use serde::Serialize;
use uuid::Uuid;

use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/auth/guest", post(create_guest_session))
        .route("/auth/me", get(current_user))
}

#[derive(Serialize)]
struct SessionResponse {
    user_id: Uuid,
    session_id: Uuid,
    kind: &'static str,
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
            kind: "guest",
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
        kind: "guest",
    })
}

fn session_id_from_headers(headers: &HeaderMap) -> Option<Uuid> {
    headers
        .get("x-wfchat-session")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| Uuid::parse_str(value).ok())
}
