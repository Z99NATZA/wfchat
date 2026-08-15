use axum::{
    extract::{Query, State},
    http::HeaderMap,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::{
    authorization_log::{
        self, AuthorizationAction, AuthorizationRejectionReason, AuthorizationResource,
    },
    error::{AppError, AppResult},
    session::session_id_from_headers,
    state::AppState,
    store::{OwnerScope, SessionRecord, SyncEntityRecord},
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/sync/changes", get(sync_changes))
        .route("/sync/preview", post(sync_preview))
        .route("/sync/commit", post(sync_commit))
        .layer(axum::middleware::from_fn(
            authorization_log::request_context,
        ))
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
    let session =
        require_sync_session(&state, &headers, AuthorizationAction::ReadSyncChanges).await?;
    let owner = OwnerScope::from_session(&session);
    let cursor = query.cursor.unwrap_or(0);
    let limit = query.limit.unwrap_or(100).clamp(1, 500);
    let entities = state
        .store
        .list_sync_entities_since(owner, cursor, limit)
        .await?;
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
    let session =
        require_sync_session(&state, &headers, AuthorizationAction::PreviewSyncChanges).await?;
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
                .await?,
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

    let session =
        require_sync_session(&state, &headers, AuthorizationAction::CommitSyncChanges).await?;
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
            .await?;
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
        .await?;
    authorization_log::sync_commit_succeeded();

    Ok(Json(SyncCommitResponse {
        operation_id: commit.operation_id,
        merged_count: commit.merged_count,
        conflict_count: commit.conflict_count,
        committed_at: commit.committed_at,
    }))
}

async fn require_sync_session(
    state: &AppState,
    headers: &HeaderMap,
    action: AuthorizationAction,
) -> AppResult<SessionRecord> {
    let Some(session_id) = session_id_from_headers(&state.config, headers) else {
        authorization_log::rejected(
            AuthorizationResource::Sync,
            action,
            axum::http::StatusCode::FORBIDDEN,
            AuthorizationRejectionReason::MissingSession,
        );
        return Err(AppError::Forbidden);
    };
    let Some(session) = state.store.get_session(session_id).await? else {
        authorization_log::rejected(
            AuthorizationResource::Sync,
            action,
            axum::http::StatusCode::FORBIDDEN,
            AuthorizationRejectionReason::InvalidSession,
        );
        return Err(AppError::Forbidden);
    };
    Ok(session)
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
    use std::{
        io::{self, Write},
        sync::{Arc, Mutex},
    };

    use super::*;
    use crate::{app::build_router, config::Config};
    use axum::{
        body::Body,
        extract::State,
        http::{Request, StatusCode},
        response::Response,
    };
    use serde_json::json;
    use tower::ServiceExt;
    use tracing_subscriber::fmt::MakeWriter;
    use uuid::Uuid;

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
        fn sync_security_events(&self) -> Vec<Value> {
            let output = self.0.lock().expect("captured log lock").clone();
            String::from_utf8(output)
                .expect("captured logs should be UTF-8")
                .lines()
                .map(|line| serde_json::from_str(line).expect("captured log should be JSON"))
                .filter(|event: &Value| {
                    matches!(
                        event["target"].as_str(),
                        Some("wfchat::authorization_security" | "wfchat::sync_security")
                    ) && event["resource"] == "sync"
                })
                .collect()
        }
    }

    async fn capture_sync_request(
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
        (response, writer.sync_security_events())
    }

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
            google_client_id: None,
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

    #[tokio::test(flavor = "current_thread")]
    async fn sync_routes_log_missing_and_invalid_sessions_without_sensitive_values() {
        let Some(state) = test_state().await else {
            return;
        };
        let invalid_session_id = Uuid::new_v4();
        let operation_id = format!("secret-operation-{}", Uuid::new_v4());
        let cases = [
            (
                "GET",
                "/api/sync/changes?cursor=987654&limit=7",
                None,
                "read_sync_changes",
            ),
            (
                "POST",
                "/api/sync/preview",
                Some(r#"{"items":[]}"#.to_owned()),
                "preview_sync_changes",
            ),
            (
                "POST",
                "/api/sync/commit",
                Some(format!(r#"{{"operation_id":"{operation_id}","items":[]}}"#)),
                "commit_sync_changes",
            ),
        ];

        for (method, uri, body, action) in cases {
            for (cookie, reason) in [
                (None, "missing_session"),
                (
                    Some(format!("wfchat_session={invalid_session_id}")),
                    "invalid_session",
                ),
            ] {
                let mut builder = Request::builder().method(method).uri(uri);
                if body.is_some() {
                    builder = builder.header(axum::http::header::CONTENT_TYPE, "application/json");
                }
                if let Some(cookie) = cookie {
                    builder = builder.header(axum::http::header::COOKIE, cookie);
                }
                let (response, events) = capture_sync_request(
                    state.clone(),
                    builder
                        .body(body.clone().map(Body::from).unwrap_or_else(Body::empty))
                        .expect("request should build"),
                )
                .await;

                assert_eq!(response.status(), StatusCode::FORBIDDEN);
                assert_eq!(events.len(), 1);
                let event = &events[0];
                assert_eq!(event["level"], "WARN");
                assert_eq!(event["event"], "authorization_rejected");
                assert_eq!(event["resource"], "sync");
                assert_eq!(event["action"], action);
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
                for excluded in [
                    invalid_session_id.to_string(),
                    operation_id.clone(),
                    "987654".to_owned(),
                    "limit".to_owned(),
                ] {
                    assert!(!encoded.contains(&excluded));
                }
            }
        }
    }

    #[tokio::test(flavor = "current_thread")]
    async fn sync_commit_logs_new_and_idempotent_success_without_payload_or_counts() {
        let Some(state) = test_state().await else {
            return;
        };
        let session = state
            .store
            .create_guest_session()
            .await
            .expect("guest session should create");
        let operation_id = format!("secret-operation-{}", Uuid::new_v4());
        let item_id = format!("secret-item-{}", Uuid::new_v4());
        let secret_url = "https://private.example/sensitive-background.png";
        let body = format!(
            r#"{{"operation_id":"{operation_id}","items":[{{"item_id":"{item_id}","item_type":"setting","updated_at":123456,"deleted_at":null,"payload":{{"key":"background","value":"{secret_url}"}}}}]}}"#
        );

        for _ in 0..2 {
            let (response, events) = capture_sync_request(
                state.clone(),
                Request::post("/api/sync/commit")
                    .header(axum::http::header::CONTENT_TYPE, "application/json")
                    .header(
                        axum::http::header::COOKIE,
                        format!("wfchat_session={}", session.id),
                    )
                    .body(Body::from(body.clone()))
                    .expect("request should build"),
            )
            .await;

            assert_eq!(response.status(), StatusCode::OK);
            assert_eq!(events.len(), 1);
            let event = &events[0];
            assert_eq!(event["level"], "INFO");
            assert_eq!(event["target"], "wfchat::sync_security");
            assert_eq!(event["event"], "sync_commit_succeeded");
            assert_eq!(event["resource"], "sync");
            assert_eq!(event["action"], "commit_sync_changes");
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
                operation_id.clone(),
                item_id.clone(),
                secret_url.to_owned(),
                "item_type".to_owned(),
                "merged_count".to_owned(),
                "conflict_count".to_owned(),
                "123456".to_owned(),
            ] {
                assert!(!encoded.contains(&excluded));
            }
        }

        state
            .store
            .delete_session_for_test(session.id)
            .await
            .expect("session cleanup should succeed");
    }

    #[tokio::test(flavor = "current_thread")]
    async fn sync_successful_read_preview_and_excluded_inputs_emit_no_security_events() {
        let Some(state) = test_state().await else {
            return;
        };
        let session = state
            .store
            .create_guest_session()
            .await
            .expect("guest session should create");
        let cookie = format!("wfchat_session={}", session.id);

        let requests = [
            Request::get("/api/sync/changes?cursor=0&limit=1")
                .header(axum::http::header::COOKIE, &cookie)
                .body(Body::empty())
                .expect("request should build"),
            Request::post("/api/sync/preview")
                .header(axum::http::header::CONTENT_TYPE, "application/json")
                .header(axum::http::header::COOKIE, &cookie)
                .body(Body::from(
                    r#"{"items":[{"item_id":"","item_type":"setting","updated_at":0,"deleted_at":null,"payload":{}}]}"#,
                ))
                .expect("request should build"),
        ];
        for request in requests {
            let (response, events) = capture_sync_request(state.clone(), request).await;
            assert_eq!(response.status(), StatusCode::OK);
            assert!(events.is_empty());
        }

        let excluded_requests = [
            Request::get("/api/sync/changes?cursor=not-a-number")
                .body(Body::empty())
                .expect("request should build"),
            Request::post("/api/sync/preview")
                .header(axum::http::header::CONTENT_TYPE, "application/json")
                .body(Body::from("not-json"))
                .expect("request should build"),
            Request::post("/api/sync/commit")
                .header(axum::http::header::CONTENT_TYPE, "application/json")
                .body(Body::from(r#"{"operation_id":" ","items":[]}"#))
                .expect("request should build"),
        ];
        for request in excluded_requests {
            let (response, events) = capture_sync_request(state.clone(), request).await;
            assert_eq!(response.status(), StatusCode::BAD_REQUEST);
            assert!(events.is_empty());
        }

        state
            .store
            .delete_session_for_test(session.id)
            .await
            .expect("session cleanup should succeed");
    }

    #[tokio::test]
    async fn sync_preview_commit_and_changes_roundtrip_for_guest_session() {
        let Some(state) = test_state().await else {
            return;
        };
        let session = state
            .store
            .create_guest_session()
            .await
            .expect("guest session should create");
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
        let session = state
            .store
            .create_guest_session()
            .await
            .expect("guest session should create");
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
        let first_session = state
            .store
            .create_guest_session()
            .await
            .expect("first guest session should create");
        let first_session = state
            .store
            .promote_session_to_registered(first_session.id, user_id)
            .await
            .expect("first promotion should query")
            .expect("first session should promote");
        let second_session = state
            .store
            .create_guest_session()
            .await
            .expect("second guest session should create");
        let second_session = state
            .store
            .promote_session_to_registered(second_session.id, user_id)
            .await
            .expect("second promotion should query")
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
        let session = state
            .store
            .create_guest_session()
            .await
            .expect("guest session should create");

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
