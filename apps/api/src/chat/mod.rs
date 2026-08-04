use axum::{
    body::Body,
    extract::DefaultBodyLimit,
    extract::{ConnectInfo, Multipart, Path, State},
    http::{header, HeaderMap, HeaderName, HeaderValue},
    response::{
        sse::{Event, KeepAlive, Sse},
        IntoResponse,
    },
    routing::get,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::{convert::Infallible, net::SocketAddr, time::Duration};
use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;
use uuid::Uuid;

const MAX_TRANSCRIPTION_AUDIO_BYTES: usize = 25 * 1024 * 1024;

use crate::{
    ai::{AiChatStreamEvent, AiImagePart, AiMessage, AiMessagePart, AiRole, AiService},
    attachments::{
        image_storage_key, read_attachment_bytes, remove_attachment_file,
        validate_image_attachment, write_attachment_bytes, CHAT_ATTACHMENT_KIND_IMAGE,
        MAX_ATTACHMENT_MULTIPART_BYTES,
    },
    characters,
    error::{AppError, AppResult},
    memory::retrieve_memory_context_observed,
    rate_limit::{RateLimitFamily, RateLimitIdentity},
    session::require_session,
    state::AppState,
    store::{
        AppendChatMessagesOutcome, ChatAttachmentRecord, ChatRecord, ChatStorageLimits,
        ChatSummaryRecord, CreateChatOutcome, NewChatAttachmentRecord, OwnerScope, SessionRecord,
        StoredMessage,
    },
    voice::{SpeechAudioStreamBody, VoiceService},
};

mod attachments;
mod messages;
mod voice;

use attachments::*;
use messages::*;
use voice::*;

#[cfg(test)]
pub(crate) use messages::prepare_text_context_for_memory_evaluation;

pub fn router(config: &crate::config::Config) -> Router<AppState> {
    let router = Router::new()
        .route("/chat-ui/config", get(get_chat_ui_config))
        .route(
            "/chat/attachments/{attachment_id}",
            axum::routing::delete(delete_chat_attachment),
        )
        .route(
            "/chat/attachments/{attachment_id}/preview",
            get(preview_chat_attachment),
        )
        .route(
            "/personas/{persona_id}/chats",
            get(list_chats_for_persona).post(create_chat_for_persona),
        )
        .route("/chats/{chat_id}", get(get_chat).delete(delete_chat))
        .route(
            "/chats/{chat_id}/messages",
            axum::routing::post(send_message)
                .delete(clear_messages)
                .layer(DefaultBodyLimit::max(
                    config.security.chat.request_max_bytes,
                )),
        )
        .route(
            "/chats/{chat_id}/messages/stream",
            axum::routing::post(stream_message).layer(DefaultBodyLimit::max(
                config.security.chat.request_max_bytes,
            )),
        );

    let router = if config.security.chat.image_upload_enabled {
        router.route(
            "/chat/attachments",
            axum::routing::post(upload_chat_attachment)
                .layer(DefaultBodyLimit::max(MAX_ATTACHMENT_MULTIPART_BYTES)),
        )
    } else {
        router
    };
    let router = if config.security.chat.transcription_enabled {
        router.route(
            "/chat/transcription",
            axum::routing::post(transcribe_user_speech).layer(DefaultBodyLimit::max(
                MAX_TRANSCRIPTION_AUDIO_BYTES.saturating_add(64 * 1024),
            )),
        )
    } else {
        router
    };
    let router = if config.security.chat.tts_enabled {
        router.route(
            "/chats/{chat_id}/messages/{message_id}/speech",
            axum::routing::post(synthesize_message_speech),
        )
    } else {
        router
    };

    router.layer(axum::middleware::from_fn(private_no_store))
}

pub(crate) async fn private_no_store(
    request: axum::extract::Request,
    next: axum::middleware::Next,
) -> axum::response::Response {
    let mut response = next.run(request).await;
    response.headers_mut().insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static("private, no-store"),
    );
    response
}

async fn require_chat_session(state: &AppState, headers: &HeaderMap) -> AppResult<SessionRecord> {
    require_session(state, headers).await
}

#[derive(Serialize)]
struct ChatResponse {
    id: Uuid,
    character_id: String,
    ai_profile_id: String,
    messages: Vec<MessageResponse>,
    updated_at: u64,
    created_at: u64,
}

#[derive(Serialize)]
struct ChatSummaryResponse {
    id: Uuid,
    character_id: String,
    last_message: String,
    updated_at: u64,
    created_at: u64,
}

#[derive(Serialize)]
struct MessageResponse {
    id: Uuid,
    role: AiRole,
    content: String,
    attachments: Vec<ChatAttachmentResponse>,
    created_at: u64,
}

#[derive(Deserialize)]
struct SendMessageRequest {
    #[serde(default)]
    content: String,
    #[serde(default)]
    attachments: Vec<SendMessageAttachmentRequest>,
    #[serde(default)]
    timezone: Option<String>,
}

#[derive(Default, Deserialize)]
struct CreateChatRequest {
    #[serde(default)]
    follow_up_id: Option<Uuid>,
}

#[derive(Deserialize)]
struct SendMessageAttachmentRequest {
    id: Uuid,
    kind: String,
}

#[derive(Serialize)]
struct SendMessageResponse {
    chat_id: Uuid,
    user_message: MessageResponse,
    assistant_message: MessageResponse,
}

#[derive(Serialize)]
struct StreamMessageStartEvent {
    chat_id: Uuid,
    persona_id: String,
}

#[derive(Serialize)]
struct StreamTokenEvent {
    text: String,
}

#[derive(Serialize)]
struct StreamMessageDoneEvent {
    chat_id: Uuid,
    user_message: MessageResponse,
    assistant_message: MessageResponse,
}

#[derive(Serialize)]
struct StreamMessageErrorEvent {
    message: String,
}

struct ChatCompletionContext {
    chat: ChatRecord,
    attachment_ids: Vec<Uuid>,
    ai_messages: Vec<AiMessage>,
    user_ai_message: AiMessage,
    user_timezone: String,
}

#[derive(Serialize)]
struct ChatUiConfigResponse {
    personas: Vec<characters::CharacterUiResponse>,
    image_upload_enabled: bool,
    voice: ChatVoiceConfigResponse,
}

#[derive(Serialize)]
struct ChatVoiceConfigResponse {
    assistant_speech_enabled: bool,
    user_transcription_enabled: bool,
    credits: Vec<ChatVoiceCreditResponse>,
}

#[derive(Serialize)]
struct ChatVoiceCreditResponse {
    text: String,
}

#[derive(Serialize)]
struct ChatAttachmentResponse {
    id: Uuid,
    kind: String,
    mime_type: String,
    byte_size: i64,
    width: Option<i32>,
    height: Option<i32>,
    preview_url: String,
}

async fn list_chats_for_persona(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(persona_id): Path<String>,
) -> AppResult<Json<Vec<ChatSummaryResponse>>> {
    let session = require_chat_session(&state, &headers).await?;
    let owner = OwnerScope::from_session(&session);
    let chats = state.store.list_chat_summaries(owner, &persona_id).await?;

    Ok(Json(chats.into_iter().map(chat_summary_response).collect()))
}

async fn get_chat_ui_config(State(state): State<AppState>) -> Json<ChatUiConfigResponse> {
    Json(ChatUiConfigResponse {
        personas: characters::list_chat_ui_characters(),
        image_upload_enabled: state.config.security.chat.image_upload_enabled,
        voice: ChatVoiceConfigResponse {
            assistant_speech_enabled: state.config.security.chat.tts_enabled
                && matches!(
                    state.config.ai_voice_provider.as_str(),
                    "mock" | "openai" | "voicevox"
                ),
            user_transcription_enabled: state.config.security.chat.transcription_enabled
                && matches!(
                    state.config.ai_transcription_provider.as_str(),
                    "mock" | "openai"
                ),
            credits: chat_voice_credits(&state.config),
        },
    })
}

async fn create_chat_for_persona(
    ConnectInfo(peer_addr): ConnectInfo<SocketAddr>,
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(persona_id): Path<String>,
    request: Option<Json<CreateChatRequest>>,
) -> AppResult<Json<ChatResponse>> {
    let session = require_chat_session(&state, &headers).await?;
    enforce_sensitive_rate_limit(
        &state,
        &headers,
        peer_addr,
        session.id,
        RateLimitFamily::ChatMessages,
    )?;
    let owner = OwnerScope::from_session(&session);
    let character = characters::character_by_id(&persona_id)
        .ok_or_else(|| AppError::BadRequest(format!("unknown character: {persona_id}")))?;
    let outcome = state
        .store
        .create_chat_with_follow_up_limited(
            owner,
            character.id.to_owned(),
            character.ai_profile_id.to_owned(),
            request.and_then(|Json(request)| request.follow_up_id),
            chat_storage_limits(&state),
        )
        .await?;
    let chat = match outcome {
        CreateChatOutcome::Created(chat) => chat,
        CreateChatOutcome::FollowUpUnavailable => {
            return Err(AppError::BadRequest("follow-up is unavailable".to_owned()));
        }
        CreateChatOutcome::ChatLimitReached => {
            return Err(AppError::Conflict("chat limit reached".to_owned()));
        }
        CreateChatOutcome::MessageLimitReached => {
            return Err(AppError::Conflict("chat message limit reached".to_owned()));
        }
    };

    Ok(Json(chat_response(chat)))
}

async fn get_chat(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(chat_id): Path<Uuid>,
) -> AppResult<Json<ChatResponse>> {
    let session = require_chat_session(&state, &headers).await?;
    let owner = OwnerScope::from_session(&session);
    let chat = state
        .store
        .get_chat(owner, chat_id)
        .await?
        .ok_or(AppError::NotFound)?;

    Ok(Json(chat_response(chat)))
}
async fn clear_messages(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(chat_id): Path<Uuid>,
) -> AppResult<Json<ChatResponse>> {
    let session = require_chat_session(&state, &headers).await?;
    let _clear_permit = state.generation_limiter.try_acquire_clear(chat_id)?;
    let owner = OwnerScope::from_session(&session);
    let chat = state
        .store
        .clear_chat_messages(owner, chat_id)
        .await?
        .ok_or(AppError::NotFound)?;

    Ok(Json(chat_response(chat)))
}

async fn delete_chat(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(chat_id): Path<Uuid>,
) -> AppResult<Json<serde_json::Value>> {
    let session = require_chat_session(&state, &headers).await?;
    let owner = OwnerScope::from_session(&session);

    if !state.store.delete_chat(owner, chat_id).await? {
        return Err(AppError::NotFound);
    }

    Ok(Json(json!({ "ok": true })))
}

fn enforce_sensitive_rate_limit(
    state: &AppState,
    headers: &HeaderMap,
    peer_addr: SocketAddr,
    session_id: Uuid,
    family: RateLimitFamily,
) -> AppResult<()> {
    let identities = sensitive_rate_limit_identities(
        headers,
        peer_addr,
        session_id,
        family,
        state.config.security.trust_proxy_headers,
        &state.config.security.trusted_proxy_cidrs,
    );
    state.rate_limiter.check_many(family, identities)
}

fn sensitive_rate_limit_identities(
    headers: &HeaderMap,
    peer_addr: SocketAddr,
    session_id: Uuid,
    family: RateLimitFamily,
    trust_proxy_headers: bool,
    trusted_proxy_cidrs: &[ipnet::IpNet],
) -> Vec<RateLimitIdentity> {
    RateLimitIdentity::for_validated_session(
        session_id,
        headers,
        peer_addr.ip(),
        trust_proxy_headers,
        trusted_proxy_cidrs,
        family == RateLimitFamily::ChatMessages,
    )
}

fn chat_response(chat: ChatRecord) -> ChatResponse {
    ChatResponse {
        id: chat.id,
        character_id: chat.character_id,
        ai_profile_id: chat.ai_profile_id,
        messages: chat.messages.into_iter().map(message_response).collect(),
        updated_at: chat.updated_at,
        created_at: chat.created_at,
    }
}

fn chat_summary_response(chat: ChatSummaryRecord) -> ChatSummaryResponse {
    ChatSummaryResponse {
        id: chat.id,
        character_id: chat.character_id,
        last_message: chat.last_message,
        updated_at: chat.updated_at,
        created_at: chat.created_at,
    }
}

fn chat_storage_limits(state: &AppState) -> ChatStorageLimits {
    ChatStorageLimits {
        max_chats_per_owner: state.config.security.chat.max_chats_per_owner,
        max_messages_per_chat: state.config.security.chat.max_messages_per_chat,
        max_stored_chars_per_chat: state.config.security.chat.max_stored_chars_per_chat,
    }
}

fn message_response(message: StoredMessage) -> MessageResponse {
    MessageResponse {
        id: message.id,
        role: message.role,
        content: message.content,
        attachments: message
            .attachments
            .into_iter()
            .map(chat_attachment_response)
            .collect(),
        created_at: message.created_at,
    }
}

fn chat_attachment_response(attachment: ChatAttachmentRecord) -> ChatAttachmentResponse {
    ChatAttachmentResponse {
        id: attachment.id,
        kind: attachment.kind,
        mime_type: attachment.mime_type,
        byte_size: attachment.byte_size,
        width: attachment.width,
        height: attachment.height,
        preview_url: format!("/api/chat/attachments/{}/preview", attachment.id),
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::{to_bytes, Body},
        http::{header, HeaderName, Request, StatusCode},
        Router,
    };
    use image::{DynamicImage, ImageBuffer, ImageFormat, Rgb, Rgba};
    use reqwest::Client;
    use serde_json::Value;
    use std::{
        io::Cursor,
        time::{SystemTime, UNIX_EPOCH},
    };
    use tower::ServiceExt;

    use crate::{
        app::build_router,
        attachments::cleanup_stale_pending_chat_attachments,
        config::Config,
        rate_limit::{RateLimitPolicies, RateLimitPolicy, RateLimiter},
        store::{ChatStore, MemoryFollowUpClaim, NewMemoryItemRecord, SessionRecord},
    };

    async fn create_test_session(state: &AppState) -> SessionRecord {
        state
            .store
            .create_guest_session()
            .await
            .expect("guest session should create")
    }

    async fn create_test_chat(state: &AppState, owner: OwnerScope) -> ChatRecord {
        state
            .store
            .create_chat(owner, "aiko".to_owned(), "aiko_default".to_owned())
            .await
            .expect("chat should create")
    }

    #[test]
    fn stream_error_message_hides_upstream_ai_details() {
        let message = stream_error_message(&AppError::Ai(
            "provider returned 401: raw upstream body".to_owned(),
        ));

        assert_eq!(message, "assistant response failed");
    }

    #[test]
    fn stream_error_message_keeps_non_ai_errors_actionable() {
        let message =
            stream_error_message(&AppError::BadRequest("message content is empty".to_owned()));

        assert_eq!(message, "bad request: message content is empty");
    }

    #[tokio::test]
    async fn stream_message_endpoint_emits_sse_and_persists_after_done() {
        let Some(state) = test_state().await else {
            return;
        };
        let session = create_test_session(&state).await;
        let owner = OwnerScope::from_session(&session);
        let chat = create_test_chat(&state, owner).await;
        let app = build_router(state.clone());
        let request = Request::builder()
            .method("POST")
            .uri(format!("/api/chats/{}/messages/stream", chat.id))
            .header(header::CONTENT_TYPE, "application/json")
            .header(header::ACCEPT, "text/event-stream")
            .header("x-wfchat-session", session.id.to_string())
            .body(Body::from(
                r#"{"content":"hello stream","timezone":"Asia/Bangkok"}"#,
            ))
            .expect("request should build");

        let response = app.oneshot(request).await.expect("request should run");

        assert_eq!(response.status(), StatusCode::OK);
        assert_header_contains(&response, header::CONTENT_TYPE, "text/event-stream");
        assert_header_contains(&response, header::CACHE_CONTROL, "private, no-store");
        assert_header_contains(
            &response,
            HeaderName::from_static("x-accel-buffering"),
            "no",
        );

        let body = to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("body should collect");
        let body = String::from_utf8(body.to_vec()).expect("body should be utf-8");
        let events = parse_sse_events(&body);

        assert_eq!(
            events.first().map(|event| event.0.as_str()),
            Some("message_start")
        );
        assert!(
            events.iter().any(|event| event.0 == "token"),
            "stream should emit token events: {body}"
        );
        assert_eq!(
            events.last().map(|event| event.0.as_str()),
            Some("message_done")
        );

        let done_payload = events
            .iter()
            .find(|event| event.0 == "message_done")
            .and_then(|event| serde_json::from_str::<Value>(&event.1).ok())
            .expect("message_done should include json payload");
        let assistant_content = done_payload["assistant_message"]["content"]
            .as_str()
            .expect("assistant content should be present");
        assert_eq!(
            assistant_content,
            "[aiko_default] mock reply: I received \"hello stream\"."
        );
        assert!(
            done_payload.get("messages").is_none(),
            "message_done should return only the committed pair"
        );

        let persisted = state
            .store
            .get_chat(owner, chat.id)
            .await
            .expect("chat lookup should query")
            .expect("chat should still exist");
        assert_eq!(persisted.messages.len(), 2);
        assert_eq!(persisted.messages[0].content, "hello stream");
        assert_eq!(persisted.messages[1].content, assistant_content);
        let extraction_job = state
            .store
            .claim_memory_extraction_job_for_test(persisted.messages[0].id)
            .await
            .expect("extraction job should query")
            .expect("extraction job should exist");
        assert_eq!(extraction_job.user_timezone, "Asia/Bangkok");

        let _ = state.store.delete_chat(owner, chat.id).await;
    }

    #[tokio::test]
    async fn chat_message_rate_limit_returns_json_429_for_send_and_stream() {
        let Some(mut state) = test_state().await else {
            return;
        };
        state.rate_limiter = RateLimiter::new(RateLimitPolicies::default().with_family_limit(
            RateLimitFamily::ChatMessages,
            RateLimitPolicy::per_minute(1),
        ));
        let session = create_test_session(&state).await;
        let owner = OwnerScope::from_session(&session);
        let chat = create_test_chat(&state, owner).await;
        let app = build_router(state.clone());

        let response = app
            .clone()
            .oneshot(chat_message_request(
                "POST",
                &format!("/api/chats/{}/messages", chat.id),
                session.id,
                "hello",
            ))
            .await
            .expect("first request should run");
        assert_eq!(response.status(), StatusCode::OK);

        let response = app
            .oneshot(chat_message_request(
                "POST",
                &format!("/api/chats/{}/messages/stream", chat.id),
                session.id,
                "hello again",
            ))
            .await
            .expect("second request should run");

        assert_eq!(response.status(), StatusCode::TOO_MANY_REQUESTS);
        assert_header_contains(&response, header::RETRY_AFTER, "60");
        let body = to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("body should collect");
        let payload: Value = serde_json::from_slice(&body).expect("error response should be json");
        assert_eq!(payload["error"].as_str(), Some("too many requests"));

        let _ = state.store.delete_chat(owner, chat.id).await;
    }

    #[tokio::test]
    async fn chat_creation_and_message_sends_share_session_ip_and_global_buckets() {
        let Some(mut state) = test_state().await else {
            return;
        };
        state.rate_limiter = RateLimiter::new(RateLimitPolicies::default().with_family_limit(
            RateLimitFamily::ChatMessages,
            RateLimitPolicy::per_minute(1),
        ));
        let session = create_test_session(&state).await;
        let owner = OwnerScope::from_session(&session);
        let existing_chat = create_test_chat(&state, owner).await;
        let app = build_router(state.clone());

        let created = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/personas/aiko/chats")
                    .header(header::CONTENT_TYPE, "application/json")
                    .header("x-wfchat-session", session.id.to_string())
                    .body(Body::from("{}"))
                    .expect("chat creation request should build"),
            )
            .await
            .expect("chat creation should run");
        assert_eq!(created.status(), StatusCode::OK);

        let rejected = app
            .oneshot(chat_message_request(
                "POST",
                &format!("/api/chats/{}/messages", existing_chat.id),
                session.id,
                "shared bucket",
            ))
            .await
            .expect("message request should run");
        assert_eq!(rejected.status(), StatusCode::TOO_MANY_REQUESTS);
        assert_header_contains(&rejected, header::RETRY_AFTER, "60");
        let body = to_bytes(rejected.into_body(), usize::MAX)
            .await
            .expect("rate response should collect");
        let payload: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(payload["error"].as_str(), Some("too many requests"));

        state
            .store
            .delete_session_for_test(session.id)
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn chat_storage_limit_conflicts_use_stable_http_contracts() {
        let Some(mut state) = test_state().await else {
            return;
        };
        let session = create_test_session(&state).await;
        let owner = OwnerScope::from_session(&session);
        let chat = create_test_chat(&state, owner).await;
        state.config.security.chat.max_chats_per_owner = 1;
        let app = build_router(state.clone());

        let chat_cap = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/personas/aiko/chats")
                    .header(header::CONTENT_TYPE, "application/json")
                    .header("x-wfchat-session", session.id.to_string())
                    .body(Body::from("{}"))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(chat_cap.status(), StatusCode::CONFLICT);
        assert_header_contains(&chat_cap, header::CACHE_CONTROL, "private, no-store");
        let body = to_bytes(chat_cap.into_body(), usize::MAX).await.unwrap();
        let payload: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(
            payload["error"].as_str(),
            Some("conflict: chat limit reached")
        );

        state.config.security.chat.max_messages_per_chat = 1;
        let message_cap = build_router(state.clone())
            .oneshot(chat_message_request(
                "POST",
                &format!("/api/chats/{}/messages", chat.id),
                session.id,
                "blocked by count",
            ))
            .await
            .unwrap();
        assert_eq!(message_cap.status(), StatusCode::CONFLICT);
        let body = to_bytes(message_cap.into_body(), usize::MAX).await.unwrap();
        let payload: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(
            payload["error"].as_str(),
            Some("conflict: chat message limit reached")
        );

        state.config.security.chat.max_messages_per_chat = 100;
        state.config.security.chat.max_stored_chars_per_chat = 1;
        let char_cap = build_router(state.clone())
            .oneshot(chat_message_request(
                "POST",
                &format!("/api/chats/{}/messages/stream", chat.id),
                session.id,
                "xx",
            ))
            .await
            .unwrap();
        assert_eq!(char_cap.status(), StatusCode::CONFLICT);
        let body = to_bytes(char_cap.into_body(), usize::MAX).await.unwrap();
        let payload: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(
            payload["error"].as_str(),
            Some("conflict: chat message limit reached")
        );

        state
            .store
            .delete_session_for_test(session.id)
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn follow_up_message_limit_uses_message_conflict_and_rolls_back_claim_link() {
        let Some(mut state) = test_state().await else {
            return;
        };
        let session = create_test_session(&state).await;
        let owner = OwnerScope::from_session(&session);
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();
        let memory = state
            .store
            .upsert_memory_item(
                owner,
                NewMemoryItemRecord {
                    character_id: "aiko".to_owned(),
                    memory_key: format!("follow-up.route-limit.{}", Uuid::new_v4()),
                    kind: "plan".to_owned(),
                    content: "Plans to send an application".to_owned(),
                    tags: vec!["career".to_owned()],
                    confidence: 0.9,
                    importance: 0.8,
                    last_reinforced_at: now,
                    expires_at: None,
                },
            )
            .await
            .unwrap();
        let claim_key = Uuid::new_v4();
        let follow_up = state
            .store
            .claim_memory_follow_up(
                owner,
                MemoryFollowUpClaim {
                    claim_key,
                    memory_id: memory.id,
                    character_id: "aiko",
                    expected_updated_at: memory.updated_at,
                    prompt: "Did you apply?",
                    shown_at: now,
                },
            )
            .await
            .unwrap()
            .expect("follow-up should claim");
        state.config.security.chat.max_messages_per_chat = 0;

        let response = build_router(state.clone())
            .oneshot(
                Request::post("/api/personas/aiko/chats")
                    .header(header::CONTENT_TYPE, "application/json")
                    .header("x-wfchat-session", session.id.to_string())
                    .body(Body::from(format!(
                        r#"{{"follow_up_id":"{}"}}"#,
                        follow_up.id
                    )))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::CONFLICT);
        assert_header_contains(&response, header::CACHE_CONTROL, "private, no-store");
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let payload: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(
            payload["error"].as_str(),
            Some("conflict: chat message limit reached")
        );
        assert!(state
            .store
            .get_memory_follow_up_by_claim(owner, "aiko", claim_key)
            .await
            .unwrap()
            .is_some());
        assert!(state.store.list_chats(owner).await.unwrap().is_empty());

        state
            .store
            .delete_session_for_test(session.id)
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn global_chat_rate_limit_applies_across_new_guest_sessions() {
        let Some(mut state) = test_state().await else {
            return;
        };
        state.rate_limiter = RateLimiter::new(
            RateLimitPolicies::default().with_chat_global_limit(RateLimitPolicy::per_minute(1)),
        );
        let first_session = create_test_session(&state).await;
        let second_session = create_test_session(&state).await;
        let first_owner = OwnerScope::from_session(&first_session);
        let second_owner = OwnerScope::from_session(&second_session);
        let first_chat = create_test_chat(&state, first_owner).await;
        let second_chat = create_test_chat(&state, second_owner).await;
        let app = build_router(state.clone());

        let first = app
            .clone()
            .oneshot(chat_message_request(
                "POST",
                &format!("/api/chats/{}/messages", first_chat.id),
                first_session.id,
                "first global request",
            ))
            .await
            .unwrap();
        assert_eq!(first.status(), StatusCode::OK);

        let second = app
            .oneshot(chat_message_request(
                "POST",
                &format!("/api/chats/{}/messages/stream", second_chat.id),
                second_session.id,
                "second global request",
            ))
            .await
            .unwrap();
        assert_eq!(second.status(), StatusCode::TOO_MANY_REQUESTS);

        let _ = state.store.delete_chat(first_owner, first_chat.id).await;
        let _ = state.store.delete_chat(second_owner, second_chat.id).await;
    }

    #[tokio::test]
    async fn stream_generation_rejects_duplicate_chat_and_stops_after_disconnect() {
        let Some(state) = test_state().await else {
            return;
        };
        let session = create_test_session(&state).await;
        let owner = OwnerScope::from_session(&session);
        let chat = create_test_chat(&state, owner).await;
        let app = build_router(state.clone());
        let uri = format!("/api/chats/{}/messages/stream", chat.id);

        let first_response = app
            .clone()
            .oneshot(chat_message_request(
                "POST",
                &uri,
                session.id,
                "keep this stream active long enough to test duplicate generation",
            ))
            .await
            .expect("first stream request should run");
        assert_eq!(first_response.status(), StatusCode::OK);

        let second_response = app
            .clone()
            .oneshot(chat_message_request(
                "POST",
                &uri,
                session.id,
                "duplicate request",
            ))
            .await
            .expect("second stream request should run");
        assert_eq!(second_response.status(), StatusCode::TOO_MANY_REQUESTS);

        let clear_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("DELETE")
                    .uri(format!("/api/chats/{}/messages", chat.id))
                    .header("x-wfchat-session", session.id.to_string())
                    .body(Body::empty())
                    .expect("clear request should build"),
            )
            .await
            .expect("clear request should run");
        assert_eq!(clear_response.status(), StatusCode::CONFLICT);
        let clear_body = to_bytes(clear_response.into_body(), usize::MAX)
            .await
            .expect("clear response should collect");
        let clear_payload: Value =
            serde_json::from_slice(&clear_body).expect("clear conflict should be json");
        assert_eq!(
            clear_payload["error"].as_str(),
            Some("conflict: chat generation in progress")
        );

        drop(first_response);
        let retry_deadline = tokio::time::Instant::now() + Duration::from_secs(2);
        loop {
            tokio::time::sleep(Duration::from_millis(25)).await;
            let retry = app
                .clone()
                .oneshot(chat_message_request(
                    "POST",
                    &format!("/api/chats/{}/messages", chat.id),
                    session.id,
                    "retry after disconnect",
                ))
                .await
                .expect("retry request should run");
            if retry.status() == StatusCode::OK {
                break;
            }
            assert_eq!(retry.status(), StatusCode::TOO_MANY_REQUESTS);
            assert!(
                tokio::time::Instant::now() < retry_deadline,
                "generation permit was not released after SSE disconnect"
            );
        }

        let persisted = state
            .store
            .get_chat(owner, chat.id)
            .await
            .expect("chat lookup should query")
            .expect("chat should still exist");
        assert_eq!(persisted.messages.len(), 2);
        assert_eq!(persisted.messages[0].content, "retry after disconnect");

        let _ = state.store.delete_chat(owner, chat.id).await;
    }

    #[tokio::test]
    async fn stream_generation_times_out_without_persisting_partial_messages() {
        let Some(mut state) = test_state().await else {
            return;
        };
        state.config.security.chat.ai_total_timeout_seconds = 1;
        let session = create_test_session(&state).await;
        let owner = OwnerScope::from_session(&session);
        let chat = create_test_chat(&state, owner).await;
        let app = build_router(state.clone());

        let response = app
            .oneshot(chat_message_request(
                "POST",
                &format!("/api/chats/{}/messages/stream", chat.id),
                session.id,
                "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen",
            ))
            .await
            .expect("stream request should run");
        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("body should collect");
        let body = String::from_utf8(body.to_vec()).expect("body should be utf-8");
        let events = parse_sse_events(&body);
        let error_payload = events
            .iter()
            .find(|event| event.0 == "error")
            .and_then(|event| serde_json::from_str::<Value>(&event.1).ok())
            .expect("timeout should emit an error event");
        assert_eq!(
            error_payload["message"].as_str(),
            Some("assistant response failed")
        );
        assert!(!events.iter().any(|event| event.0 == "message_done"));

        let persisted = state
            .store
            .get_chat(owner, chat.id)
            .await
            .expect("chat lookup should query")
            .expect("chat should still exist");
        assert!(persisted.messages.is_empty());

        let retry = build_router(state.clone())
            .oneshot(chat_message_request(
                "POST",
                &format!("/api/chats/{}/messages", chat.id),
                session.id,
                "retry after timeout",
            ))
            .await
            .expect("retry after timeout should run");
        assert_eq!(retry.status(), StatusCode::OK);

        let _ = state.store.delete_chat(owner, chat.id).await;
    }

    #[tokio::test]
    async fn chat_rejects_unknown_session_without_creating_client_selected_id() {
        let Some(state) = test_state().await else {
            return;
        };
        let session_id = Uuid::new_v4();
        let app = build_router(state.clone());
        let request = chat_message_request(
            "POST",
            &format!("/api/chats/{}/messages", Uuid::new_v4()),
            session_id,
            "hello",
        );

        let response = app.oneshot(request).await.expect("request should run");

        assert_eq!(response.status(), StatusCode::FORBIDDEN);
        assert!(state
            .store
            .get_session(session_id)
            .await
            .expect("session lookup should query")
            .is_none());
    }

    #[tokio::test]
    async fn chat_rejects_oversized_message_before_generation() {
        let Some(mut state) = test_state().await else {
            return;
        };
        state.config.security.chat.message_max_chars = 3;
        let session = create_test_session(&state).await;
        let owner = OwnerScope::from_session(&session);
        let chat = create_test_chat(&state, owner).await;
        let app = build_router(state.clone());

        let response = app
            .oneshot(chat_message_request(
                "POST",
                &format!("/api/chats/{}/messages", chat.id),
                session.id,
                "four",
            ))
            .await
            .expect("request should run");

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        let persisted = state
            .store
            .get_chat(owner, chat.id)
            .await
            .expect("chat lookup should query")
            .expect("chat should exist");
        assert!(persisted.messages.is_empty());
        let _ = state.store.delete_chat(owner, chat.id).await;
    }

    #[tokio::test]
    async fn json_output_exact_boundary_passes_and_unicode_overflow_does_not_persist() {
        let Some(mut state) = test_state().await else {
            return;
        };
        let session = create_test_session(&state).await;
        let owner = OwnerScope::from_session(&session);
        let exact_chat = create_test_chat(&state, owner).await;
        let exact_input = "ขอบเขต";
        let exact_output = crate::ai::providers::mock::complete_chat(
            &exact_chat.ai_profile_id,
            &[AiMessage::user(exact_input.to_owned())],
        )
        .text_content();
        state.config.security.chat.output_max_chars = exact_output.chars().count();
        let app = build_router(state.clone());

        let exact = app
            .clone()
            .oneshot(chat_message_request(
                "POST",
                &format!("/api/chats/{}/messages", exact_chat.id),
                session.id,
                exact_input,
            ))
            .await
            .unwrap();
        assert_eq!(exact.status(), StatusCode::OK);

        let overflow_chat = create_test_chat(&state, owner).await;
        let overflow = app
            .oneshot(chat_message_request(
                "POST",
                &format!("/api/chats/{}/messages", overflow_chat.id),
                session.id,
                "ข้อความภาษาไทยที่ยาวกว่าเดิม",
            ))
            .await
            .unwrap();
        assert_eq!(overflow.status(), StatusCode::BAD_GATEWAY);
        let body = to_bytes(overflow.into_body(), usize::MAX).await.unwrap();
        let payload: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(payload["error"], "assistant response failed");
        assert!(state
            .store
            .get_chat(owner, overflow_chat.id)
            .await
            .unwrap()
            .unwrap()
            .messages
            .is_empty());

        let _ = state.store.delete_chat(owner, exact_chat.id).await;
        let _ = state.store.delete_chat(owner, overflow_chat.id).await;
    }

    #[tokio::test]
    async fn sse_output_limit_rejects_whole_chunk_without_done_or_persistence() {
        let Some(mut state) = test_state().await else {
            return;
        };
        state.config.security.chat.output_max_chars = "[aiko_default] ".chars().count();
        let session = create_test_session(&state).await;
        let owner = OwnerScope::from_session(&session);
        let chat = create_test_chat(&state, owner).await;
        let app = build_router(state.clone());

        let response = app
            .oneshot(chat_message_request(
                "POST",
                &format!("/api/chats/{}/messages/stream", chat.id),
                session.id,
                "stream overflow",
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let body = String::from_utf8(body.to_vec()).unwrap();
        let events = parse_sse_events(&body);
        let token_text = events
            .iter()
            .filter(|event| event.0 == "token")
            .filter_map(|event| serde_json::from_str::<Value>(&event.1).ok())
            .filter_map(|payload| payload["text"].as_str().map(str::to_owned))
            .collect::<String>();

        assert_eq!(token_text, "[aiko_default] ");
        assert!(events.iter().any(|event| event.0 == "error"));
        assert!(!events.iter().any(|event| event.0 == "message_done"));
        assert!(state
            .store
            .get_chat(owner, chat.id)
            .await
            .unwrap()
            .unwrap()
            .messages
            .is_empty());

        let _ = state.store.delete_chat(owner, chat.id).await;
    }

    #[tokio::test]
    async fn sse_output_exact_boundary_emits_done_and_persists() {
        let Some(mut state) = test_state().await else {
            return;
        };
        let session = create_test_session(&state).await;
        let owner = OwnerScope::from_session(&session);
        let chat = create_test_chat(&state, owner).await;
        let input = "exact stream boundary";
        let expected = crate::ai::providers::mock::complete_chat(
            &chat.ai_profile_id,
            &[AiMessage::user(input.to_owned())],
        )
        .text_content();
        state.config.security.chat.output_max_chars = expected.chars().count();
        let app = build_router(state.clone());

        let response = app
            .oneshot(chat_message_request(
                "POST",
                &format!("/api/chats/{}/messages/stream", chat.id),
                session.id,
                input,
            ))
            .await
            .unwrap();
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        let events = parse_sse_events(std::str::from_utf8(&body).unwrap());

        assert!(events.iter().any(|event| event.0 == "message_done"));
        assert!(!events.iter().any(|event| event.0 == "error"));
        let persisted = state.store.get_chat(owner, chat.id).await.unwrap().unwrap();
        assert_eq!(persisted.messages[1].content, expected);

        let _ = state.store.delete_chat(owner, chat.id).await;
    }

    #[tokio::test]
    async fn chat_rejects_request_body_over_configured_limit() {
        let Some(mut state) = test_state().await else {
            return;
        };
        state.config.security.chat.request_max_bytes = 32;
        let session = create_test_session(&state).await;
        let owner = OwnerScope::from_session(&session);
        let chat = create_test_chat(&state, owner).await;
        let app = build_router(state.clone());

        let response = app
            .oneshot(chat_message_request(
                "POST",
                &format!("/api/chats/{}/messages", chat.id),
                session.id,
                "this request body is intentionally larger than thirty-two bytes",
            ))
            .await
            .expect("request should run");

        assert_eq!(response.status(), StatusCode::PAYLOAD_TOO_LARGE);
        let _ = state.store.delete_chat(owner, chat.id).await;
    }

    #[tokio::test]
    async fn chat_json_error_hides_upstream_ai_details() {
        let Some(mut state) = test_state_with_provider("openai").await else {
            return;
        };
        let session = create_test_session(&state).await;
        let owner = OwnerScope::from_session(&session);
        let chat = create_test_chat(&state, owner).await;
        let app = build_router(state.clone());

        let response = app
            .oneshot(chat_message_request(
                "POST",
                &format!("/api/chats/{}/messages", chat.id),
                session.id,
                "hello",
            ))
            .await
            .expect("request should run");

        assert_eq!(response.status(), StatusCode::BAD_GATEWAY);
        let body = to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("body should collect");
        let payload: Value = serde_json::from_slice(&body).expect("error should be json");
        assert_eq!(payload["error"].as_str(), Some("assistant response failed"));

        state.config.ai_provider = "mock".to_owned();
        let retry = build_router(state.clone())
            .oneshot(chat_message_request(
                "POST",
                &format!("/api/chats/{}/messages", chat.id),
                session.id,
                "retry after provider error",
            ))
            .await
            .expect("retry after provider error should run");
        assert_eq!(retry.status(), StatusCode::OK);
        let _ = state.store.delete_chat(owner, chat.id).await;
    }

    #[tokio::test]
    async fn stream_message_endpoint_sends_sanitized_error_without_persisting() {
        let Some(state) = test_state_with_provider("openai").await else {
            return;
        };
        let session = create_test_session(&state).await;
        let owner = OwnerScope::from_session(&session);
        let chat = create_test_chat(&state, owner).await;
        let app = build_router(state.clone());
        let request = Request::builder()
            .method("POST")
            .uri(format!("/api/chats/{}/messages/stream", chat.id))
            .header(header::CONTENT_TYPE, "application/json")
            .header(header::ACCEPT, "text/event-stream")
            .header("x-wfchat-session", session.id.to_string())
            .body(Body::from(r#"{"content":"hello stream"}"#))
            .expect("request should build");

        let response = app.oneshot(request).await.expect("request should run");

        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("body should collect");
        let body = String::from_utf8(body.to_vec()).expect("body should be utf-8");
        let events = parse_sse_events(&body);

        assert_eq!(
            events
                .iter()
                .map(|event| event.0.as_str())
                .collect::<Vec<_>>(),
            ["message_start", "error"]
        );
        let error_payload = events
            .iter()
            .find(|event| event.0 == "error")
            .and_then(|event| serde_json::from_str::<Value>(&event.1).ok())
            .expect("error event should include json payload");
        assert_eq!(
            error_payload["message"].as_str(),
            Some("assistant response failed")
        );
        assert!(
            !body.contains("OPENAI_API_KEY"),
            "stream error should not expose upstream configuration details: {body}"
        );

        let persisted = state
            .store
            .get_chat(owner, chat.id)
            .await
            .expect("chat lookup should query")
            .expect("chat should still exist");
        assert!(persisted.messages.is_empty());

        let _ = state.store.delete_chat(owner, chat.id).await;
    }

    #[tokio::test]
    async fn stream_message_endpoint_links_image_attachment_to_user_message() {
        let Some(state) = test_state().await else {
            return;
        };
        let session = create_test_session(&state).await;
        let owner = OwnerScope::from_session(&session);
        let upload_dir = state.config.chat_attachment_upload_dir.clone();
        let chat = create_test_chat(&state, owner).await;
        let app = build_router(state.clone());
        let upload_payload = upload_png_attachment(app.clone(), session.id).await;
        let attachment_id = upload_payload["id"]
            .as_str()
            .expect("upload response should include attachment id");
        let request = Request::builder()
            .method("POST")
            .uri(format!("/api/chats/{}/messages/stream", chat.id))
            .header(header::CONTENT_TYPE, "application/json")
            .header(header::ACCEPT, "text/event-stream")
            .header("x-wfchat-session", session.id.to_string())
            .body(Body::from(format!(
                r#"{{"content":"","attachments":[{{"id":"{attachment_id}","kind":"image"}}]}}"#
            )))
            .expect("request should build");

        let response = app.oneshot(request).await.expect("request should run");

        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("body should collect");
        let body = String::from_utf8(body.to_vec()).expect("body should be utf-8");
        let events = parse_sse_events(&body);
        let done_payload = events
            .iter()
            .find(|event| event.0 == "message_done")
            .and_then(|event| serde_json::from_str::<Value>(&event.1).ok())
            .expect("message_done should include json payload");

        assert_eq!(
            done_payload["user_message"]["attachments"][0]["id"].as_str(),
            Some(attachment_id)
        );
        assert_eq!(
            done_payload["user_message"]["attachments"][0]["preview_url"].as_str(),
            Some(format!("/api/chat/attachments/{attachment_id}/preview").as_str())
        );
        assert_eq!(
            done_payload["assistant_message"]["content"].as_str(),
            Some("[aiko_default] mock reply: I received \"\" with 1 image attachment(s).")
        );

        let persisted = state
            .store
            .get_chat(owner, chat.id)
            .await
            .expect("chat lookup should query")
            .expect("chat should still exist");
        assert_eq!(persisted.messages.len(), 2);
        assert_eq!(persisted.messages[0].attachments.len(), 1);
        assert_eq!(
            persisted.messages[0].attachments[0].id.to_string(),
            attachment_id
        );
        assert_eq!(persisted.messages[0].attachments[0].chat_id, Some(chat.id));
        assert_eq!(
            persisted.messages[0].attachments[0].message_id,
            Some(persisted.messages[0].id)
        );

        let _ = state.store.delete_chat(owner, chat.id).await;
        let _ = tokio::fs::remove_dir_all(upload_dir).await;
    }

    #[tokio::test]
    async fn stream_message_endpoint_rejects_image_for_unsupported_provider_without_persisting() {
        let Some(state) = test_state_with_provider("lmstudio").await else {
            return;
        };
        let session = create_test_session(&state).await;
        let owner = OwnerScope::from_session(&session);
        let upload_dir = state.config.chat_attachment_upload_dir.clone();
        let chat = create_test_chat(&state, owner).await;
        let app = build_router(state.clone());
        let upload_payload = upload_png_attachment(app.clone(), session.id).await;
        let attachment_id = Uuid::parse_str(
            upload_payload["id"]
                .as_str()
                .expect("upload response should include attachment id"),
        )
        .expect("attachment id should be uuid");
        let request = Request::builder()
            .method("POST")
            .uri(format!("/api/chats/{}/messages/stream", chat.id))
            .header(header::CONTENT_TYPE, "application/json")
            .header(header::ACCEPT, "text/event-stream")
            .header("x-wfchat-session", session.id.to_string())
            .body(Body::from(format!(
                r#"{{"content":"look","attachments":[{{"id":"{attachment_id}","kind":"image"}}]}}"#
            )))
            .expect("request should build");

        let response = app.oneshot(request).await.expect("request should run");

        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("body should collect");
        let body = String::from_utf8(body.to_vec()).expect("body should be utf-8");
        let events = parse_sse_events(&body);
        assert_eq!(
            events
                .iter()
                .map(|event| event.0.as_str())
                .collect::<Vec<_>>(),
            ["message_start", "error"]
        );
        let error_payload = events
            .iter()
            .find(|event| event.0 == "error")
            .and_then(|event| serde_json::from_str::<Value>(&event.1).ok())
            .expect("error event should include json payload");
        assert_eq!(
            error_payload["message"].as_str(),
            Some("bad request: image attachments are not supported by the configured AI provider")
        );

        let persisted = state
            .store
            .get_chat(owner, chat.id)
            .await
            .expect("chat lookup should query")
            .expect("chat should still exist");
        assert!(persisted.messages.is_empty());
        let attachment = state
            .store
            .get_chat_attachment(owner, attachment_id)
            .await
            .expect("attachment lookup should query")
            .expect("attachment should remain pending");
        assert_eq!(attachment.chat_id, None);
        assert_eq!(attachment.message_id, None);

        let _ = state.store.delete_chat(owner, chat.id).await;
        let _ = tokio::fs::remove_dir_all(upload_dir).await;
    }

    #[tokio::test]
    async fn stream_message_endpoint_keeps_attachment_pending_when_ai_fails() {
        let Some(state) = test_state_with_provider("openai").await else {
            return;
        };
        let session = create_test_session(&state).await;
        let owner = OwnerScope::from_session(&session);
        let upload_dir = state.config.chat_attachment_upload_dir.clone();
        let chat = create_test_chat(&state, owner).await;
        let app = build_router(state.clone());
        let upload_payload = upload_png_attachment(app.clone(), session.id).await;
        let attachment_id = Uuid::parse_str(
            upload_payload["id"]
                .as_str()
                .expect("upload response should include attachment id"),
        )
        .expect("attachment id should be uuid");
        let request = Request::builder()
            .method("POST")
            .uri(format!("/api/chats/{}/messages/stream", chat.id))
            .header(header::CONTENT_TYPE, "application/json")
            .header(header::ACCEPT, "text/event-stream")
            .header("x-wfchat-session", session.id.to_string())
            .body(Body::from(format!(
                r#"{{"content":"look","attachments":[{{"id":"{attachment_id}","kind":"image"}}]}}"#
            )))
            .expect("request should build");

        let response = app.oneshot(request).await.expect("request should run");

        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("body should collect");
        let body = String::from_utf8(body.to_vec()).expect("body should be utf-8");
        let events = parse_sse_events(&body);
        assert_eq!(
            events
                .iter()
                .map(|event| event.0.as_str())
                .collect::<Vec<_>>(),
            ["message_start", "error"]
        );

        let persisted = state
            .store
            .get_chat(owner, chat.id)
            .await
            .expect("chat lookup should query")
            .expect("chat should still exist");
        assert!(persisted.messages.is_empty());
        let attachment = state
            .store
            .get_chat_attachment(owner, attachment_id)
            .await
            .expect("attachment lookup should query")
            .expect("attachment should remain pending");
        assert_eq!(attachment.chat_id, None);
        assert_eq!(attachment.message_id, None);
        assert_eq!(attachment.deleted_at, None);

        let _ = state.store.delete_chat(owner, chat.id).await;
        let _ = tokio::fs::remove_dir_all(upload_dir).await;
    }

    #[tokio::test]
    async fn synthesize_message_speech_endpoint_returns_mock_audio_for_assistant_message() {
        let Some(state) = test_state().await else {
            return;
        };
        let session = create_test_session(&state).await;
        let owner = OwnerScope::from_session(&session);
        let chat = create_test_chat(&state, owner).await;
        let user_message = StoredMessage::from_ai_message(AiMessage::user("hello".to_owned()));
        let assistant_message =
            StoredMessage::from_ai_message(AiMessage::assistant("hello back".to_owned()));
        state
            .store
            .append_chat_messages(owner, chat.id, user_message, assistant_message.clone())
            .await
            .expect("messages should append");
        let app = build_router(state.clone());
        let request = Request::builder()
            .method("POST")
            .uri(format!(
                "/api/chats/{}/messages/{}/speech",
                chat.id, assistant_message.id
            ))
            .header("x-wfchat-session", session.id.to_string())
            .body(Body::empty())
            .expect("request should build");

        let response = app.oneshot(request).await.expect("request should run");

        assert_eq!(response.status(), StatusCode::OK);
        assert_header_contains(&response, header::CONTENT_TYPE, "audio/wav");
        assert_header_contains(&response, header::CACHE_CONTROL, "no-store");
        let body = to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("body should collect");
        assert!(body.starts_with(b"RIFF"));
        assert_eq!(&body[8..12], b"WAVE");

        let _ = state.store.delete_chat(owner, chat.id).await;
    }

    #[tokio::test]
    async fn synthesize_message_speech_endpoint_rate_limits_by_session() {
        let Some(mut state) = test_state().await else {
            return;
        };
        state.rate_limiter = RateLimiter::new(RateLimitPolicies::default().with_family_limit(
            RateLimitFamily::AssistantSpeech,
            RateLimitPolicy::per_minute(1),
        ));
        let session = create_test_session(&state).await;
        let owner = OwnerScope::from_session(&session);
        let chat = create_test_chat(&state, owner).await;
        let user_message = StoredMessage::from_ai_message(AiMessage::user("hello".to_owned()));
        let assistant_message =
            StoredMessage::from_ai_message(AiMessage::assistant("hello back".to_owned()));
        state
            .store
            .append_chat_messages(owner, chat.id, user_message, assistant_message.clone())
            .await
            .expect("messages should append");
        let app = build_router(state.clone());
        let uri = format!(
            "/api/chats/{}/messages/{}/speech",
            chat.id, assistant_message.id
        );

        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(&uri)
                    .header("x-wfchat-session", session.id.to_string())
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("first speech request should run");
        assert_eq!(response.status(), StatusCode::OK);

        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(&uri)
                    .header("x-wfchat-session", session.id.to_string())
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("second speech request should run");

        assert_eq!(response.status(), StatusCode::TOO_MANY_REQUESTS);

        let _ = state.store.delete_chat(owner, chat.id).await;
    }

    #[tokio::test]
    async fn synthesize_message_speech_endpoint_rejects_user_messages() {
        let Some(state) = test_state().await else {
            return;
        };
        let session = create_test_session(&state).await;
        let owner = OwnerScope::from_session(&session);
        let chat = create_test_chat(&state, owner).await;
        let user_message = StoredMessage::from_ai_message(AiMessage::user("hello".to_owned()));
        let assistant_message =
            StoredMessage::from_ai_message(AiMessage::assistant("hello back".to_owned()));
        state
            .store
            .append_chat_messages(owner, chat.id, user_message.clone(), assistant_message)
            .await
            .expect("messages should append");
        let app = build_router(state.clone());
        let request = Request::builder()
            .method("POST")
            .uri(format!(
                "/api/chats/{}/messages/{}/speech",
                chat.id, user_message.id
            ))
            .header("x-wfchat-session", session.id.to_string())
            .body(Body::empty())
            .expect("request should build");

        let response = app.oneshot(request).await.expect("request should run");

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        let body = to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("body should collect");
        let body = String::from_utf8(body.to_vec()).expect("body should be utf-8");
        assert!(body.contains("speech is only available for assistant messages"));

        let _ = state.store.delete_chat(owner, chat.id).await;
    }

    #[tokio::test]
    async fn transcribe_user_speech_endpoint_returns_mock_transcript() {
        let Some(state) = test_state().await else {
            return;
        };
        let session = create_test_session(&state).await;
        let app = build_router(state);
        let boundary = "wfchat-test-boundary";
        let body = format!(
            "--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"voice.webm\"\r\nContent-Type: audio/webm\r\n\r\nfake-audio\r\n--{boundary}--\r\n"
        );
        let request = Request::builder()
            .method("POST")
            .uri("/api/chat/transcription")
            .header(
                header::CONTENT_TYPE,
                format!("multipart/form-data; boundary={boundary}"),
            )
            .header("x-wfchat-session", session.id.to_string())
            .body(Body::from(body))
            .expect("request should build");

        let response = app.oneshot(request).await.expect("request should run");

        assert_eq!(response.status(), StatusCode::OK);
        assert_header_contains(&response, header::CACHE_CONTROL, "no-store");
        let body = to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("body should collect");
        let payload: Value =
            serde_json::from_slice(&body).expect("transcription response should be json");
        assert_eq!(payload["text"], "Mock voice transcript");
    }

    #[tokio::test]
    async fn transcribe_user_speech_endpoint_rate_limits_by_session() {
        let Some(mut state) = test_state().await else {
            return;
        };
        state.rate_limiter = RateLimiter::new(RateLimitPolicies::default().with_family_limit(
            RateLimitFamily::UserTranscription,
            RateLimitPolicy::per_minute(1),
        ));
        let session = create_test_session(&state).await;
        let app = build_router(state);
        let boundary = "wfchat-test-boundary";

        let response = app
            .clone()
            .oneshot(transcription_request(boundary, session.id))
            .await
            .expect("first transcription request should run");
        assert_eq!(response.status(), StatusCode::OK);

        let response = app
            .oneshot(transcription_request(boundary, session.id))
            .await
            .expect("second transcription request should run");

        assert_eq!(response.status(), StatusCode::TOO_MANY_REQUESTS);
    }

    #[tokio::test]
    async fn upload_chat_attachment_accepts_png_and_enforces_preview_ownership() {
        let Some(state) = test_state().await else {
            return;
        };
        let session = create_test_session(&state).await;
        let other_session = create_test_session(&state).await;
        let upload_dir = state.config.chat_attachment_upload_dir.clone();
        let app = build_router(state.clone());
        let boundary = "wfchat-image-upload";
        let request = Request::builder()
            .method("POST")
            .uri("/api/chat/attachments")
            .header(
                header::CONTENT_TYPE,
                format!("multipart/form-data; boundary={boundary}"),
            )
            .header("x-wfchat-session", session.id.to_string())
            .body(Body::from(multipart_file_body(boundary, &png_bytes(2, 3))))
            .expect("request should build");

        let response = app
            .clone()
            .oneshot(request)
            .await
            .expect("request should run");

        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("body should collect");
        let payload: Value = serde_json::from_slice(&body).expect("upload response should be json");
        assert_eq!(payload["kind"].as_str(), Some("image"));
        assert_eq!(payload["mime_type"].as_str(), Some("image/png"));
        assert_eq!(payload["width"].as_i64(), Some(2));
        assert_eq!(payload["height"].as_i64(), Some(3));
        let preview_url = payload["preview_url"]
            .as_str()
            .expect("preview url should be present");

        let request = Request::builder()
            .method("GET")
            .uri(preview_url)
            .header("x-wfchat-session", other_session.id.to_string())
            .body(Body::empty())
            .expect("request should build");
        let response = app
            .clone()
            .oneshot(request)
            .await
            .expect("request should run");
        assert_eq!(response.status(), StatusCode::NOT_FOUND);

        let request = Request::builder()
            .method("GET")
            .uri(preview_url)
            .header("x-wfchat-session", session.id.to_string())
            .body(Body::empty())
            .expect("request should build");
        let response = app
            .clone()
            .oneshot(request)
            .await
            .expect("request should run");
        assert_eq!(response.status(), StatusCode::OK);
        assert_header_contains(&response, header::CONTENT_TYPE, "image/png");
        assert_header_contains(&response, header::CACHE_CONTROL, "no-store");

        let request = Request::builder()
            .method("DELETE")
            .uri(preview_url.trim_end_matches("/preview"))
            .header("x-wfchat-session", other_session.id.to_string())
            .body(Body::empty())
            .expect("request should build");
        let response = app
            .clone()
            .oneshot(request)
            .await
            .expect("request should run");
        assert_eq!(response.status(), StatusCode::NOT_FOUND);

        let request = Request::builder()
            .method("DELETE")
            .uri(preview_url.trim_end_matches("/preview"))
            .header("x-wfchat-session", session.id.to_string())
            .body(Body::empty())
            .expect("request should build");
        let response = app.oneshot(request).await.expect("request should run");
        assert_eq!(response.status(), StatusCode::OK);

        let _ = tokio::fs::remove_dir_all(upload_dir).await;
    }

    #[tokio::test]
    async fn upload_chat_attachment_endpoint_rate_limits_by_session() {
        let Some(mut state) = test_state().await else {
            return;
        };
        state.rate_limiter = RateLimiter::new(
            RateLimitPolicies::default()
                .with_family_limit(RateLimitFamily::ImageUpload, RateLimitPolicy::per_minute(1)),
        );
        let session = create_test_session(&state).await;
        let upload_dir = state.config.chat_attachment_upload_dir.clone();
        let app = build_router(state);

        let response = app
            .clone()
            .oneshot(upload_png_request(session.id))
            .await
            .expect("first upload request should run");
        assert_eq!(response.status(), StatusCode::OK);

        let response = app
            .oneshot(upload_png_request(session.id))
            .await
            .expect("second upload request should run");

        assert_eq!(response.status(), StatusCode::TOO_MANY_REQUESTS);

        let _ = tokio::fs::remove_dir_all(upload_dir).await;
    }

    #[tokio::test]
    async fn upload_chat_attachment_rate_limits_shared_trusted_ip_across_sessions() {
        let Some(mut state) = test_state().await else {
            return;
        };
        state.config.security.trust_proxy_headers = true;
        state.config.security.trusted_proxy_cidrs =
            vec!["127.0.0.0/8".parse().expect("test CIDR should parse")];
        state.rate_limiter = RateLimiter::new(
            RateLimitPolicies::default()
                .with_family_limit(RateLimitFamily::ImageUpload, RateLimitPolicy::per_minute(1)),
        );
        let first_session = create_test_session(&state).await;
        let second_session = create_test_session(&state).await;
        let upload_dir = state.config.chat_attachment_upload_dir.clone();
        let app = build_router(state);

        let response = app
            .clone()
            .oneshot(upload_png_request_with_ip(first_session.id, "203.0.113.50"))
            .await
            .expect("first upload request should run");
        assert_eq!(response.status(), StatusCode::OK);

        let response = app
            .oneshot(upload_png_request_with_ip(
                second_session.id,
                "203.0.113.50",
            ))
            .await
            .expect("second upload request should run");

        assert_eq!(response.status(), StatusCode::TOO_MANY_REQUESTS);

        let _ = tokio::fs::remove_dir_all(upload_dir).await;
    }

    #[tokio::test]
    async fn upload_chat_attachment_accepts_jpeg_webp_and_gif() {
        let Some(state) = test_state().await else {
            return;
        };
        let session = create_test_session(&state).await;
        let upload_dir = state.config.chat_attachment_upload_dir.clone();
        let app = build_router(state);

        for (format, expected_mime) in [
            (ImageFormat::Jpeg, "image/jpeg"),
            (ImageFormat::WebP, "image/webp"),
            (ImageFormat::Gif, "image/gif"),
        ] {
            let boundary = "wfchat-image-upload";
            let request = Request::builder()
                .method("POST")
                .uri("/api/chat/attachments")
                .header(
                    header::CONTENT_TYPE,
                    format!("multipart/form-data; boundary={boundary}"),
                )
                .header("x-wfchat-session", session.id.to_string())
                .body(Body::from(multipart_file_body(
                    boundary,
                    &image_bytes(2, 3, format),
                )))
                .expect("request should build");

            let response = app
                .clone()
                .oneshot(request)
                .await
                .expect("request should run");

            assert_eq!(response.status(), StatusCode::OK);
            let body = to_bytes(response.into_body(), usize::MAX)
                .await
                .expect("body should collect");
            let payload: Value =
                serde_json::from_slice(&body).expect("upload response should be json");
            assert_eq!(payload["kind"].as_str(), Some("image"));
            assert_eq!(payload["mime_type"].as_str(), Some(expected_mime));
            assert_eq!(payload["width"].as_i64(), Some(2));
            assert_eq!(payload["height"].as_i64(), Some(3));
            assert!(
                payload["preview_url"]
                    .as_str()
                    .is_some_and(|url| url.starts_with("/api/chat/attachments/")),
                "upload response should include backend preview url"
            );
        }

        let _ = tokio::fs::remove_dir_all(upload_dir).await;
    }

    #[tokio::test]
    async fn stale_pending_attachment_cleanup_removes_only_orphaned_pending_files() {
        let Some(state) = test_state().await else {
            return;
        };
        let session = create_test_session(&state).await;
        let owner = OwnerScope::from_session(&session);
        let upload_dir = state.config.chat_attachment_upload_dir.clone();
        let app = build_router(state.clone());

        let stale_pending_id =
            uploaded_attachment_id(upload_png_attachment(app.clone(), session.id).await);
        let linked_id =
            uploaded_attachment_id(upload_png_attachment(app.clone(), session.id).await);
        let current_pending_id =
            uploaded_attachment_id(upload_png_attachment(app.clone(), session.id).await);

        let stale_pending = state
            .store
            .set_chat_attachment_created_at_for_test(stale_pending_id, 1)
            .await
            .expect("attachment update should query")
            .expect("stale pending attachment should exist");
        let chat = create_test_chat(&state, owner).await;
        let user_message = StoredMessage::from_ai_message(AiMessage::user("with image".to_owned()));
        let assistant_message =
            StoredMessage::from_ai_message(AiMessage::assistant("ok".to_owned()));
        state
            .store
            .append_chat_messages_with_attachments(
                owner,
                chat.id,
                user_message,
                assistant_message,
                &[linked_id],
            )
            .await
            .expect("linked attachment should append");
        let linked = state
            .store
            .set_chat_attachment_created_at_for_test(linked_id, 1)
            .await
            .expect("attachment update should query")
            .expect("linked attachment should exist");
        let current_pending = state
            .store
            .get_chat_attachment(owner, current_pending_id)
            .await
            .expect("attachment lookup should query")
            .expect("current pending attachment should exist");

        let cleaned_count =
            cleanup_stale_pending_chat_attachments(&state.config, &state.store).await;

        assert_eq!(cleaned_count, 1);
        assert!(
            state
                .store
                .get_chat_attachment(owner, stale_pending_id)
                .await
                .expect("attachment lookup should query")
                .is_none(),
            "stale pending attachment metadata should be hidden after cleanup"
        );
        assert!(
            read_attachment_bytes(&upload_dir, &stale_pending.storage_key)
                .await
                .is_err(),
            "stale pending attachment file should be removed"
        );
        assert!(
            state
                .store
                .get_chat_attachment(owner, linked_id)
                .await
                .expect("attachment lookup should query")
                .is_some(),
            "linked attachment metadata should be preserved"
        );
        assert!(
            read_attachment_bytes(&upload_dir, &linked.storage_key)
                .await
                .is_ok(),
            "linked attachment file should be preserved"
        );
        assert!(
            state
                .store
                .get_chat_attachment(owner, current_pending_id)
                .await
                .expect("attachment lookup should query")
                .is_some(),
            "current pending attachment metadata should be preserved"
        );
        assert!(
            read_attachment_bytes(&upload_dir, &current_pending.storage_key)
                .await
                .is_ok(),
            "current pending attachment file should be preserved"
        );

        let _ = state.store.delete_chat(owner, chat.id).await;
        let _ = tokio::fs::remove_dir_all(upload_dir).await;
    }

    #[tokio::test]
    async fn upload_chat_attachment_rejects_svg_bytes_even_with_image_content_type() {
        let Some(state) = test_state().await else {
            return;
        };
        let session = create_test_session(&state).await;
        let app = build_router(state.clone());
        let boundary = "wfchat-image-upload";
        let request = Request::builder()
            .method("POST")
            .uri("/api/chat/attachments")
            .header(
                header::CONTENT_TYPE,
                format!("multipart/form-data; boundary={boundary}"),
            )
            .header("x-wfchat-session", session.id.to_string())
            .body(Body::from(multipart_file_body(
                boundary,
                br#"<svg xmlns="http://www.w3.org/2000/svg"></svg>"#,
            )))
            .expect("request should build");

        let response = app.oneshot(request).await.expect("request should run");

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        let body = to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("body should collect");
        let payload: Value = serde_json::from_slice(&body).expect("error response should be json");
        assert_eq!(
            payload["error"].as_str(),
            Some("bad request: image attachment type is not supported")
        );

        let _ = tokio::fs::remove_dir_all(state.config.chat_attachment_upload_dir).await;
    }

    #[tokio::test]
    async fn streaming_and_non_streaming_share_bounded_memory_context_preparation() {
        let Some(state) = test_state().await else {
            return;
        };
        let session = create_test_session(&state).await;
        let owner = OwnerScope::from_session(&session);
        let chat = create_test_chat(&state, owner).await;
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        state
            .store
            .upsert_memory_item(
                owner,
                NewMemoryItemRecord {
                    character_id: "aiko".to_owned(),
                    memory_key: "travel.food.preference".to_owned(),
                    kind: "preference".to_owned(),
                    content: "Likes spicy ramen while travelling".to_owned(),
                    tags: vec!["travel".to_owned(), "food".to_owned()],
                    confidence: 0.9,
                    importance: 0.8,
                    last_reinforced_at: now,
                    expires_at: None,
                },
            )
            .await
            .expect("memory should save");
        let payload = SendMessageRequest {
            content: "Recommend travel food in Osaka".to_owned(),
            attachments: Vec::new(),
            timezone: None,
        };

        let non_streaming = prepare_chat_completion_context(&state, owner, chat.id, &payload)
            .await
            .expect("non-streaming context should prepare");
        let streaming = prepare_chat_completion_context(&state, owner, chat.id, &payload)
            .await
            .expect("streaming context should prepare");
        assert_eq!(
            serde_json::to_value(&non_streaming.ai_messages).unwrap(),
            serde_json::to_value(&streaming.ai_messages).unwrap()
        );
        assert_eq!(non_streaming.ai_messages[0].role, AiRole::System);
        assert!(non_streaming.ai_messages[0]
            .text_content()
            .contains("Likes spicy ramen while travelling"));
        assert_eq!(
            non_streaming
                .ai_messages
                .last()
                .map(|message| &message.role),
            Some(&AiRole::User)
        );

        let _ = state.store.delete_chat(owner, chat.id).await;
    }

    #[tokio::test]
    async fn chat_ui_config_exposes_transcription_capability() {
        let Some(state) = test_state().await else {
            return;
        };
        let app = build_router(state);
        let request = Request::builder()
            .method("GET")
            .uri("/api/chat-ui/config")
            .body(Body::empty())
            .expect("request should build");

        let response = app.oneshot(request).await.expect("request should run");

        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("body should collect");
        let payload: Value = serde_json::from_slice(&body).expect("config should be json");
        assert_eq!(payload.as_object().map(serde_json::Map::len), Some(3));
        assert!(payload.get("personas").is_some());
        assert_eq!(payload["image_upload_enabled"], true);
        assert!(payload.get("voice").is_some());
        assert_eq!(payload["voice"]["assistant_speech_enabled"], true);
        assert_eq!(payload["voice"]["user_transcription_enabled"], true);
        assert_eq!(
            payload["voice"]["credits"].as_array().map(Vec::len),
            Some(0)
        );
    }

    #[tokio::test]
    async fn disabled_media_features_are_hidden_and_unavailable() {
        let Some(mut state) = test_state().await else {
            return;
        };
        state.config.security.chat.image_upload_enabled = false;
        state.config.security.chat.transcription_enabled = false;
        state.config.security.chat.tts_enabled = false;
        let session = create_test_session(&state).await;
        let app = build_router(state);

        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/api/chat-ui/config")
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("config request should run");
        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("body should collect");
        let payload: Value = serde_json::from_slice(&body).expect("config should be json");
        assert_eq!(payload["image_upload_enabled"], false);
        assert_eq!(payload["voice"]["assistant_speech_enabled"], false);
        assert_eq!(payload["voice"]["user_transcription_enabled"], false);

        let response = app
            .clone()
            .oneshot(upload_png_request(session.id))
            .await
            .expect("upload request should run");
        assert_eq!(response.status(), StatusCode::NOT_FOUND);

        let response = app
            .clone()
            .oneshot(transcription_request("wfchat-disabled-media", session.id))
            .await
            .expect("transcription request should run");
        assert_eq!(response.status(), StatusCode::NOT_FOUND);

        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!(
                        "/api/chats/{}/messages/{}/speech",
                        Uuid::new_v4(),
                        Uuid::new_v4()
                    ))
                    .header("x-wfchat-session", session.id.to_string())
                    .body(Body::empty())
                    .expect("request should build"),
            )
            .await
            .expect("speech request should run");
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn chat_ui_config_exposes_voicevox_credit_without_provider_controls() {
        let Some(mut state) = test_state().await else {
            return;
        };
        state.config.ai_voice_provider = "voicevox".to_owned();
        state.config.voicevox_speaker_id = "3".to_owned();
        state.config.voicevox_credit = Some("VOICEVOX: Test Speaker".to_owned());
        let app = build_router(state);
        let request = Request::builder()
            .method("GET")
            .uri("/api/chat-ui/config")
            .body(Body::empty())
            .expect("request should build");

        let response = app.oneshot(request).await.expect("request should run");

        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("body should collect");
        let payload: Value = serde_json::from_slice(&body).expect("config should be json");
        assert_eq!(
            payload["voice"]["credits"][0]["text"].as_str(),
            Some("VOICEVOX: Test Speaker")
        );
        assert!(payload["voice"].get("provider").is_none());
        assert!(payload["voice"].get("speaker_id").is_none());
        assert!(payload["voice"].get("model").is_none());
        assert!(payload["voice"].get("api_key").is_none());
    }

    async fn test_state() -> Option<AppState> {
        test_state_with_provider("mock").await
    }

    async fn test_state_with_provider(ai_provider: &str) -> Option<AppState> {
        let database_url = std::env::var("WFCHAT_TEST_DATABASE_URL").ok()?;
        let store = ChatStore::connect(&database_url)
            .await
            .expect("WFCHAT_TEST_DATABASE_URL should identify a reachable test database");
        Some(AppState {
            config: Config {
                app_host: "127.0.0.1".to_owned(),
                app_port: 0,
                frontend_origin: "http://localhost:5173".to_owned(),
                ai_provider: ai_provider.to_owned(),
                ai_voice_provider: "mock".to_owned(),
                ai_voice_model: "gpt-4o-mini-tts".to_owned(),
                ai_voice_id: "marin".to_owned(),
                ai_voice_format: "mp3".to_owned(),
                ai_voice_instructions: None,
                ai_voice_speech_text_policy: "original".to_owned(),
                ai_transcription_provider: "mock".to_owned(),
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
                chat_attachment_upload_dir: test_upload_dir(),
                chat_attachment_max_bytes: 10 * 1024 * 1024,
                chat_attachment_max_images_per_message: 4,
                chat_attachment_max_width: 8192,
                chat_attachment_max_height: 8192,
                chat_attachment_max_pixels: 20_000_000,
                security: Default::default(),
            },
            http: Client::new(),
            rate_limiter: RateLimiter::default(),
            generation_limiter: crate::rate_limit::GenerationLimiter::new(8, 2),
            store,
            cafe: crate::cafe::CafeHub::default(),
            memory_telemetry: crate::memory::MemoryTelemetry::default(),
        })
    }

    fn test_upload_dir() -> String {
        std::env::temp_dir()
            .join(format!("wfchat-api-upload-test-{}", Uuid::new_v4()))
            .to_string_lossy()
            .to_string()
    }

    fn png_bytes(width: u32, height: u32) -> Vec<u8> {
        let image = ImageBuffer::from_pixel(width, height, Rgba([1, 2, 3, 255]));
        let mut bytes = Cursor::new(Vec::new());
        DynamicImage::ImageRgba8(image)
            .write_to(&mut bytes, ImageFormat::Png)
            .expect("test png should encode");
        bytes.into_inner()
    }

    fn image_bytes(width: u32, height: u32, format: ImageFormat) -> Vec<u8> {
        let image = ImageBuffer::from_pixel(width, height, Rgb([1, 2, 3]));
        let mut bytes = Cursor::new(Vec::new());
        DynamicImage::ImageRgb8(image)
            .write_to(&mut bytes, format)
            .expect("test image should encode");
        bytes.into_inner()
    }

    fn multipart_file_body(boundary: &str, file_bytes: &[u8]) -> Vec<u8> {
        let mut body = Vec::new();
        body.extend_from_slice(format!("--{boundary}\r\n").as_bytes());
        body.extend_from_slice(
            b"Content-Disposition: form-data; name=\"file\"; filename=\"local.png\"\r\n",
        );
        body.extend_from_slice(b"Content-Type: image/png\r\n\r\n");
        body.extend_from_slice(file_bytes);
        body.extend_from_slice(format!("\r\n--{boundary}--\r\n").as_bytes());
        body
    }

    async fn upload_png_attachment(app: Router, session_id: Uuid) -> Value {
        let response = app
            .oneshot(upload_png_request(session_id))
            .await
            .expect("request should run");
        assert_eq!(response.status(), StatusCode::OK);
        let body = to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("body should collect");
        serde_json::from_slice(&body).expect("upload response should be json")
    }

    fn upload_png_request(session_id: Uuid) -> Request<Body> {
        let boundary = "wfchat-image-upload";
        Request::builder()
            .method("POST")
            .uri("/api/chat/attachments")
            .header(
                header::CONTENT_TYPE,
                format!("multipart/form-data; boundary={boundary}"),
            )
            .header("x-wfchat-session", session_id.to_string())
            .body(Body::from(multipart_file_body(boundary, &png_bytes(2, 3))))
            .expect("request should build")
    }

    fn upload_png_request_with_ip(session_id: Uuid, ip: &str) -> Request<Body> {
        let boundary = "wfchat-image-upload";
        Request::builder()
            .method("POST")
            .uri("/api/chat/attachments")
            .header(
                header::CONTENT_TYPE,
                format!("multipart/form-data; boundary={boundary}"),
            )
            .header("x-wfchat-session", session_id.to_string())
            .header("x-forwarded-for", ip)
            .body(Body::from(multipart_file_body(boundary, &png_bytes(2, 3))))
            .expect("request should build")
    }

    fn chat_message_request(
        method: &str,
        uri: &str,
        session_id: Uuid,
        content: &str,
    ) -> Request<Body> {
        Request::builder()
            .method(method)
            .uri(uri)
            .header(header::CONTENT_TYPE, "application/json")
            .header("x-wfchat-session", session_id.to_string())
            .body(Body::from(json!({ "content": content }).to_string()))
            .expect("request should build")
    }

    fn transcription_request(boundary: &str, session_id: Uuid) -> Request<Body> {
        let body = format!(
            "--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"voice.webm\"\r\nContent-Type: audio/webm\r\n\r\nfake-audio\r\n--{boundary}--\r\n"
        );
        Request::builder()
            .method("POST")
            .uri("/api/chat/transcription")
            .header(
                header::CONTENT_TYPE,
                format!("multipart/form-data; boundary={boundary}"),
            )
            .header("x-wfchat-session", session_id.to_string())
            .body(Body::from(body))
            .expect("request should build")
    }

    fn uploaded_attachment_id(payload: Value) -> Uuid {
        Uuid::parse_str(
            payload["id"]
                .as_str()
                .expect("upload response should include attachment id"),
        )
        .expect("attachment id should be uuid")
    }

    fn assert_header_contains(
        response: &axum::response::Response,
        header_name: HeaderName,
        expected: &str,
    ) {
        let value = response
            .headers()
            .get(header_name)
            .and_then(|value| value.to_str().ok())
            .unwrap_or_default();
        assert!(
            value.contains(expected),
            "expected header to contain {expected:?}, got {value:?}"
        );
    }

    fn parse_sse_events(body: &str) -> Vec<(String, String)> {
        body.replace("\r\n", "\n")
            .replace('\r', "\n")
            .split("\n\n")
            .filter_map(|frame| {
                let mut event_name = "message".to_owned();
                let mut data_lines = Vec::new();
                for line in frame.lines() {
                    if let Some(value) = line.strip_prefix("event:") {
                        event_name = value.trim_start().to_owned();
                    }
                    if let Some(value) = line.strip_prefix("data:") {
                        data_lines.push(value.trim_start().to_owned());
                    }
                }

                (!data_lines.is_empty()).then(|| (event_name, data_lines.join("\n")))
            })
            .collect()
    }
}
