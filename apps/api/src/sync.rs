use axum::{
    extract::State,
    http::HeaderMap,
    routing::post,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    error::{AppError, AppResult},
    state::AppState,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/sync/preview", post(sync_preview))
        .route("/sync/commit", post(sync_commit))
}

#[derive(Deserialize)]
struct SyncPreviewRequest {
    items: Vec<SyncItemInput>,
}

#[derive(Deserialize)]
struct SyncCommitRequest {
    operation_id: String,
    items: Vec<SyncItemInput>,
}

#[derive(Deserialize)]
struct SyncItemInput {
    item_type: String,
    updated_at: u64,
}

#[derive(Serialize)]
struct SyncPreviewResponse {
    to_create: u32,
    to_update: u32,
    conflicts: u32,
}

#[derive(Serialize)]
struct SyncCommitResponse {
    operation_id: String,
    merged_count: u32,
    conflict_count: u32,
    committed_at: u64,
}

async fn sync_preview(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<SyncPreviewRequest>,
) -> AppResult<Json<SyncPreviewResponse>> {
    let session = state
        .store
        .ensure_session(session_id_from_headers(&headers))
        .await;
    let server_entities = state.store.count_sync_entities(session.id).await;
    let client_items = payload.items.len() as u32;
    let valid_items = payload
        .items
        .iter()
        .filter(|item| !item.item_type.trim().is_empty() && item.updated_at > 0)
        .count() as u32;
    let to_create = client_items.saturating_sub(server_entities);
    let to_update = server_entities.min(valid_items);

    Ok(Json(SyncPreviewResponse {
        to_create,
        to_update,
        conflicts: 0,
    }))
}

async fn sync_commit(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<SyncCommitRequest>,
) -> AppResult<Json<SyncCommitResponse>> {
    if payload.operation_id.trim().is_empty() {
        return Err(AppError::BadRequest("operation_id is required".to_owned()));
    }

    let session = state
        .store
        .ensure_session(session_id_from_headers(&headers))
        .await;
    let merged_count = payload.items.len() as u32;
    let commit = state
        .store
        .save_sync_commit(session.id, session.user_id, &payload.operation_id, merged_count, 0)
        .await
        .ok_or_else(|| AppError::BadRequest("could not save sync commit".to_owned()))?;

    Ok(Json(SyncCommitResponse {
        operation_id: commit.operation_id,
        merged_count: commit.merged_count,
        conflict_count: commit.conflict_count,
        committed_at: commit.committed_at,
    }))
}

fn session_id_from_headers(headers: &HeaderMap) -> Option<Uuid> {
    headers
        .get("x-wfchat-session")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| Uuid::parse_str(value).ok())
}
