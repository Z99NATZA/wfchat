use axum::{
    extract::State,
    http::HeaderMap,
    routing::post,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use crate::{
    error::{AppError, AppResult},
    state::AppState,
    store::SyncEntityRecord,
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
    item_id: String,
    item_type: String,
    updated_at: u64,
    deleted_at: Option<u64>,
    payload: Value,
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
    let mut to_create = 0_u32;
    let mut to_update = 0_u32;
    let mut conflicts = 0_u32;

    for item in &payload.items {
        if item.item_id.trim().is_empty() || item.item_type.trim().is_empty() || item.updated_at == 0 {
            conflicts += 1;
            continue;
        }

        match state
            .store
            .get_sync_entity_updated_at(session.id, &item.item_id)
            .await
        {
            None => to_create += 1,
            Some(existing_updated_at) if item.updated_at >= existing_updated_at => to_update += 1,
            Some(_) => conflicts += 1,
        }
    }

    Ok(Json(SyncPreviewResponse {
        to_create,
        to_update,
        conflicts,
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
    let mut merged_count = 0_u32;
    for item in &payload.items {
        if item.item_id.trim().is_empty() || item.item_type.trim().is_empty() || item.updated_at == 0 {
            continue;
        }

        let saved = state
            .store
            .upsert_sync_entity(&SyncEntityRecord {
                session_id: session.id,
                item_id: item.item_id.clone(),
                item_type: item.item_type.clone(),
                updated_at: item.updated_at,
                deleted_at: item.deleted_at,
                payload: item.payload.clone(),
            })
            .await;
        if saved {
            merged_count += 1;
        }
    }

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
