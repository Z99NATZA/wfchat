use axum::{
    extract::{Query, State},
    http::HeaderMap,
    routing::{get, post},
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
        .route("/sync/changes", get(sync_changes))
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

#[derive(Deserialize, Serialize)]
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

#[derive(Deserialize)]
struct SyncChangesQuery {
    cursor: Option<u64>,
    limit: Option<u32>,
}

#[derive(Serialize)]
struct SyncChangesResponse {
    items: Vec<SyncItemInput>,
    next_cursor: u64,
}

async fn sync_changes(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<SyncChangesQuery>,
) -> AppResult<Json<SyncChangesResponse>> {
    let session = state
        .store
        .ensure_session(session_id_from_headers(&headers))
        .await;
    let cursor = query.cursor.unwrap_or(0);
    let limit = query.limit.unwrap_or(100).clamp(1, 500);
    let entities = state
        .store
        .list_sync_entities_since(session.id, cursor, limit)
        .await;
    let mut next_cursor = cursor;
    let items = entities
        .into_iter()
        .map(|entity| {
            if entity.updated_at > next_cursor {
                next_cursor = entity.updated_at;
            }
            SyncItemInput {
                item_id: entity.item_id,
                item_type: entity.item_type,
                updated_at: entity.updated_at,
                deleted_at: entity.deleted_at,
                payload: entity.payload,
            }
        })
        .collect();

    Ok(Json(SyncChangesResponse { items, next_cursor }))
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
