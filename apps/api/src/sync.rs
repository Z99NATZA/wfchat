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
    store::{OwnerScope, SyncEntityRecord},
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

#[derive(Clone, Deserialize, Serialize)]
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

enum PreviewAction {
    Create,
    Update,
    Conflict,
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
    let owner = OwnerScope::from_session(&session);
    let cursor = query.cursor.unwrap_or(0);
    let limit = query.limit.unwrap_or(100).clamp(1, 500);
    let entities = state
        .store
        .list_sync_entities_since(owner, cursor, limit)
        .await;
    let mut next_cursor = cursor;
    let items = entities
        .into_iter()
        .map(|entity| {
            next_cursor = advance_cursor(next_cursor, entity.updated_at);
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
    let owner = OwnerScope::from_session(&session);
    let mut to_create = 0_u32;
    let mut to_update = 0_u32;
    let mut conflicts = 0_u32;

    for item in &payload.items {
        if !is_valid_item(item) {
            conflicts += 1;
            continue;
        }

        let action = classify_preview_action(
            item,
            state
                .store
                .get_sync_entity_updated_at(owner, &item.item_id)
                .await,
        );
        match action {
            PreviewAction::Create => to_create += 1,
            PreviewAction::Update => to_update += 1,
            PreviewAction::Conflict => conflicts += 1,
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
    let owner = OwnerScope::from_session(&session);
    let mut merged_count = 0_u32;
    for item in &payload.items {
        if !is_valid_item(item) {
            continue;
        }

        let saved = state
            .store
            .upsert_sync_entity(&SyncEntityRecord {
                session_id: session.id,
                owner_user_id: owner.user_id,
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
        .save_sync_commit(
            session.id,
            session.user_id,
            &payload.operation_id,
            merged_count,
            0,
        )
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

fn is_valid_item(item: &SyncItemInput) -> bool {
    !item.item_id.trim().is_empty() && !item.item_type.trim().is_empty() && item.updated_at > 0
}

fn classify_preview_action(
    item: &SyncItemInput,
    existing_updated_at: Option<u64>,
) -> PreviewAction {
    if !is_valid_item(item) {
        return PreviewAction::Conflict;
    }

    match existing_updated_at {
        None => PreviewAction::Create,
        Some(existing) if item.updated_at >= existing => PreviewAction::Update,
        Some(_) => PreviewAction::Conflict,
    }
}

fn advance_cursor(cursor: u64, updated_at: u64) -> u64 {
    cursor.max(updated_at)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::Config;
    use axum::extract::State;
    use serde_json::json;

    fn item(updated_at: u64) -> SyncItemInput {
        SyncItemInput {
            item_id: "settings.theme".to_owned(),
            item_type: "setting".to_owned(),
            updated_at,
            deleted_at: None,
            payload: json!({ "key": "theme", "value": "dark" }),
        }
    }

    fn unique_item(updated_at: u64) -> SyncItemInput {
        let item_id = format!("settings.theme.{}", Uuid::new_v4());
        SyncItemInput {
            item_id,
            item_type: "setting".to_owned(),
            updated_at,
            deleted_at: None,
            payload: json!({ "key": "theme", "value": "dark" }),
        }
    }

    async fn test_state() -> Option<AppState> {
        let database_url = std::env::var("WFCHAT_TEST_DATABASE_URL").ok()?;
        AppState::new(Config {
            app_host: "127.0.0.1".to_owned(),
            app_port: 0,
            frontend_origin: "http://localhost:5173".to_owned(),
            ai_provider: "mock".to_owned(),
            ai_model: "mock-waifu".to_owned(),
            ai_voice_provider: "disabled".to_owned(),
            database_url,
            openai_api_key: None,
            openai_base_url: "https://api.openai.com/v1".to_owned(),
            openai_model: "gpt-4.1-mini".to_owned(),
            lmstudio_base_url: "http://localhost:1234/v1".to_owned(),
            lmstudio_model: "local-model".to_owned(),
            xai_api_key: None,
            xai_base_url: "https://api.x.ai/v1".to_owned(),
            xai_model: "grok-3-mini".to_owned(),
            google_client_id: None,
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

    #[test]
    fn preview_create_when_no_existing() {
        let action = classify_preview_action(&item(10), None);
        assert!(matches!(action, PreviewAction::Create));
    }

    #[test]
    fn preview_update_when_newer_or_equal() {
        let newer = classify_preview_action(&item(20), Some(10));
        let equal = classify_preview_action(&item(10), Some(10));
        assert!(matches!(newer, PreviewAction::Update));
        assert!(matches!(equal, PreviewAction::Update));
    }

    #[test]
    fn preview_conflict_when_older_or_invalid() {
        let older = classify_preview_action(&item(5), Some(10));
        assert!(matches!(older, PreviewAction::Conflict));

        let mut invalid = item(0);
        invalid.item_id = "".to_owned();
        let invalid_action = classify_preview_action(&invalid, None);
        assert!(matches!(invalid_action, PreviewAction::Conflict));
    }

    #[test]
    fn cursor_advances_to_max_timestamp() {
        let cursor = 100;
        let cursor = advance_cursor(cursor, 90);
        let cursor = advance_cursor(cursor, 110);
        let cursor = advance_cursor(cursor, 105);
        assert_eq!(cursor, 110);
    }

    #[tokio::test]
    async fn sync_preview_commit_and_changes_roundtrip_for_guest_session() {
        let Some(state) = test_state().await else {
            return;
        };
        let session = state.store.create_guest_session().await;
        let headers = session_headers(session.id);
        let sync_item = unique_item(100);

        let Json(preview) = sync_preview(
            State(state.clone()),
            headers.clone(),
            Json(SyncPreviewRequest {
                items: vec![sync_item.clone()],
            }),
        )
        .await
        .expect("preview should succeed");
        assert_eq!(preview.to_create, 1);
        assert_eq!(preview.to_update, 0);
        assert_eq!(preview.conflicts, 0);

        let operation_id = format!("test-operation-{}", Uuid::new_v4());
        let Json(commit) = sync_commit(
            State(state.clone()),
            headers.clone(),
            Json(SyncCommitRequest {
                operation_id: operation_id.clone(),
                items: vec![sync_item.clone()],
            }),
        )
        .await
        .expect("commit should succeed");
        assert_eq!(commit.operation_id, operation_id);
        assert_eq!(commit.merged_count, 1);
        assert_eq!(commit.conflict_count, 0);
        assert!(commit.committed_at > 0);

        let Json(changes) = sync_changes(
            State(state.clone()),
            headers,
            Query(SyncChangesQuery {
                cursor: Some(0),
                limit: Some(10),
            }),
        )
        .await
        .expect("changes should succeed");
        let saved = changes
            .items
            .iter()
            .find(|item| item.item_id == sync_item.item_id)
            .expect("committed sync item should be listed");
        assert_eq!(saved.item_type, "setting");
        assert_eq!(saved.updated_at, 100);
        assert_eq!(saved.payload["value"], "dark");
        assert!(changes.next_cursor >= 100);
    }

    #[tokio::test]
    async fn sync_preview_reports_update_and_conflict_against_existing_item() {
        let Some(state) = test_state().await else {
            return;
        };
        let session = state.store.create_guest_session().await;
        let headers = session_headers(session.id);
        let mut existing = unique_item(50);

        let _ = sync_commit(
            State(state.clone()),
            headers.clone(),
            Json(SyncCommitRequest {
                operation_id: format!("seed-operation-{}", Uuid::new_v4()),
                items: vec![existing.clone()],
            }),
        )
        .await
        .expect("seed commit should succeed");

        let mut newer = existing.clone();
        newer.updated_at = 60;
        newer.payload = json!({ "key": "theme", "value": "light" });
        existing.updated_at = 40;

        let Json(preview) = sync_preview(
            State(state),
            headers,
            Json(SyncPreviewRequest {
                items: vec![newer, existing],
            }),
        )
        .await
        .expect("preview should succeed");
        assert_eq!(preview.to_create, 0);
        assert_eq!(preview.to_update, 1);
        assert_eq!(preview.conflicts, 1);
    }

    #[tokio::test]
    async fn registered_sync_changes_are_visible_across_sessions() {
        let Some(state) = test_state().await else {
            return;
        };
        let user_id = Uuid::new_v4();
        let first_session = state.store.create_guest_session().await;
        let first_session = state
            .store
            .promote_session_to_registered(first_session.id, user_id)
            .await
            .expect("first session should promote");
        let second_session = state.store.create_guest_session().await;
        let second_session = state
            .store
            .promote_session_to_registered(second_session.id, user_id)
            .await
            .expect("second session should promote");
        let sync_item = unique_item(75);

        let _ = sync_commit(
            State(state.clone()),
            session_headers(first_session.id),
            Json(SyncCommitRequest {
                operation_id: format!("registered-operation-{}", Uuid::new_v4()),
                items: vec![sync_item.clone()],
            }),
        )
        .await
        .expect("registered commit should succeed");

        let Json(changes) = sync_changes(
            State(state),
            session_headers(second_session.id),
            Query(SyncChangesQuery {
                cursor: Some(0),
                limit: Some(50),
            }),
        )
        .await
        .expect("changes should succeed");
        assert!(changes
            .items
            .iter()
            .any(|item| item.item_id == sync_item.item_id));
    }

    #[tokio::test]
    async fn sync_commit_requires_operation_id() {
        let Some(state) = test_state().await else {
            return;
        };
        let session = state.store.create_guest_session().await;

        let result = sync_commit(
            State(state),
            session_headers(session.id),
            Json(SyncCommitRequest {
                operation_id: " ".to_owned(),
                items: vec![unique_item(10)],
            }),
        )
        .await;
        let error = match result {
            Ok(_) => panic!("blank operation id should fail"),
            Err(error) => error,
        };

        assert_eq!(error.to_string(), "bad request: operation_id is required");
    }
}
