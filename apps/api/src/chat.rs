use axum::{
    extract::{Path, State},
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
use std::{convert::Infallible, time::Duration};
use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;
use uuid::Uuid;

use crate::{
    ai::{AiChatStreamEvent, AiMessage, AiRole, AiService},
    characters,
    error::{AppError, AppResult},
    state::AppState,
    store::{ChatRecord, OwnerScope, StoredMessage},
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/chat-ui/config", get(get_chat_ui_config))
        .route(
            "/personas/{persona_id}/chats",
            get(list_chats_for_persona).post(create_chat_for_persona),
        )
        .route("/chats/{chat_id}", get(get_chat).delete(delete_chat))
        .route(
            "/chats/{chat_id}/messages",
            axum::routing::post(send_message).delete(clear_messages),
        )
        .route(
            "/chats/{chat_id}/messages/stream",
            axum::routing::post(stream_message),
        )
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
struct MessageResponse {
    id: Uuid,
    role: AiRole,
    content: String,
    created_at: u64,
}

#[derive(Deserialize)]
struct SendMessageRequest {
    content: String,
}

#[derive(Serialize)]
struct SendMessageResponse {
    chat_id: Uuid,
    user_message: MessageResponse,
    assistant_message: MessageResponse,
    messages: Vec<MessageResponse>,
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
    messages: Vec<MessageResponse>,
}

#[derive(Serialize)]
struct StreamMessageErrorEvent {
    message: String,
}

struct ChatCompletionContext {
    chat: ChatRecord,
    ai_messages: Vec<AiMessage>,
    user_ai_message: AiMessage,
}

#[derive(Serialize)]
struct ChatUiConfigResponse {
    personas: Vec<characters::CharacterUiResponse>,
    quick_prompts: Vec<&'static str>,
}

async fn list_chats_for_persona(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(persona_id): Path<String>,
) -> Json<Vec<ChatResponse>> {
    let session = state
        .store
        .ensure_session(session_id_from_headers(&headers))
        .await;
    let owner = OwnerScope::from_session(&session);
    let chats = state
        .store
        .list_chats(owner)
        .await
        .into_iter()
        .filter(|chat| chat.character_id == persona_id)
        .collect::<Vec<_>>();

    Json(chats.into_iter().map(chat_response).collect())
}

async fn get_chat_ui_config() -> Json<ChatUiConfigResponse> {
    Json(ChatUiConfigResponse {
        personas: characters::list_chat_ui_characters(),
        quick_prompts: vec![
            "Make it sweeter",
            "Add playful banter",
            "Suggest a reply",
            "Save this memory",
        ],
    })
}

async fn create_chat_for_persona(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(persona_id): Path<String>,
) -> AppResult<Json<ChatResponse>> {
    let session = state
        .store
        .ensure_session(session_id_from_headers(&headers))
        .await;
    let owner = OwnerScope::from_session(&session);
    let character = characters::character_by_id(&persona_id)
        .ok_or_else(|| AppError::BadRequest(format!("unknown character: {persona_id}")))?;
    let chat = state
        .store
        .create_chat(
            owner,
            character.id.to_owned(),
            character.ai_profile_id.to_owned(),
        )
        .await;

    Ok(Json(chat_response(chat)))
}

async fn get_chat(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(chat_id): Path<Uuid>,
) -> AppResult<Json<ChatResponse>> {
    let session = state
        .store
        .ensure_session(session_id_from_headers(&headers))
        .await;
    let owner = OwnerScope::from_session(&session);
    let chat = state
        .store
        .get_chat(owner, chat_id)
        .await
        .ok_or(AppError::NotFound)?;

    Ok(Json(chat_response(chat)))
}

async fn send_message(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(chat_id): Path<Uuid>,
    Json(payload): Json<SendMessageRequest>,
) -> AppResult<Json<SendMessageResponse>> {
    let session = state
        .store
        .ensure_session(session_id_from_headers(&headers))
        .await;
    let owner = OwnerScope::from_session(&session);
    let context = prepare_chat_completion_context(&state, owner, chat_id, &payload.content).await?;
    let completed = complete_and_append_chat_message(state, owner, chat_id, context).await?;

    Ok(Json(SendMessageResponse {
        chat_id,
        user_message: message_response(completed.user_message),
        assistant_message: message_response(completed.assistant_message),
        messages: completed
            .updated_chat
            .messages
            .into_iter()
            .map(message_response)
            .collect(),
    }))
}

async fn stream_message(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(chat_id): Path<Uuid>,
    Json(payload): Json<SendMessageRequest>,
) -> AppResult<impl IntoResponse> {
    let session = state
        .store
        .ensure_session(session_id_from_headers(&headers))
        .await;
    let owner = OwnerScope::from_session(&session);
    let context = prepare_chat_completion_context(&state, owner, chat_id, &payload.content).await?;
    let persona_id = context.chat.character_id.clone();
    let (sender, receiver) = mpsc::channel::<Result<Event, Infallible>>(16);

    tokio::spawn(async move {
        send_sse_event(
            &sender,
            "message_start",
            StreamMessageStartEvent {
                chat_id,
                persona_id,
            },
        )
        .await;

        match stream_and_append_chat_message(state, owner, chat_id, context, sender.clone()).await {
            Ok(completed) => {
                send_sse_event(
                    &sender,
                    "message_done",
                    StreamMessageDoneEvent {
                        chat_id,
                        user_message: message_response(completed.user_message),
                        assistant_message: message_response(completed.assistant_message),
                        messages: completed
                            .updated_chat
                            .messages
                            .into_iter()
                            .map(message_response)
                            .collect(),
                    },
                )
                .await;
            }
            Err(error) => {
                send_sse_event(
                    &sender,
                    "error",
                    StreamMessageErrorEvent {
                        message: stream_error_message(&error),
                    },
                )
                .await;
            }
        }
    });

    let stream = ReceiverStream::new(receiver);
    let response_headers = [
        (header::CACHE_CONTROL, HeaderValue::from_static("no-cache")),
        (
            HeaderName::from_static("x-accel-buffering"),
            HeaderValue::from_static("no"),
        ),
    ];

    Ok((
        response_headers,
        Sse::new(stream).keep_alive(KeepAlive::new().interval(Duration::from_secs(15))),
    ))
}

async fn clear_messages(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(chat_id): Path<Uuid>,
) -> AppResult<Json<ChatResponse>> {
    let session = state
        .store
        .ensure_session(session_id_from_headers(&headers))
        .await;
    let owner = OwnerScope::from_session(&session);
    let chat = state
        .store
        .clear_chat_messages(owner, chat_id)
        .await
        .ok_or(AppError::NotFound)?;

    Ok(Json(chat_response(chat)))
}

async fn delete_chat(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(chat_id): Path<Uuid>,
) -> AppResult<Json<serde_json::Value>> {
    let session = state
        .store
        .ensure_session(session_id_from_headers(&headers))
        .await;
    let owner = OwnerScope::from_session(&session);

    if !state.store.delete_chat(owner, chat_id).await {
        return Err(AppError::NotFound);
    }

    Ok(Json(json!({ "ok": true })))
}

fn session_id_from_headers(headers: &HeaderMap) -> Option<Uuid> {
    headers
        .get("x-wfchat-session")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| Uuid::parse_str(value).ok())
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

fn message_response(message: StoredMessage) -> MessageResponse {
    MessageResponse {
        id: message.id,
        role: message.role,
        content: message.content,
        created_at: message.created_at,
    }
}

struct CompletedChatMessage {
    user_message: StoredMessage,
    assistant_message: StoredMessage,
    updated_chat: ChatRecord,
}

async fn prepare_chat_completion_context(
    state: &AppState,
    owner: OwnerScope,
    chat_id: Uuid,
    content: &str,
) -> AppResult<ChatCompletionContext> {
    let content = content.trim();

    if content.is_empty() {
        return Err(AppError::BadRequest("message content is empty".to_owned()));
    }

    let chat = state
        .store
        .get_chat(owner, chat_id)
        .await
        .ok_or(AppError::NotFound)?;
    let mut ai_messages = chat
        .messages
        .iter()
        .map(StoredMessage::to_ai_message)
        .collect::<Vec<_>>();
    let memory_facts = state
        .store
        .list_memory_facts(owner, &chat.character_id)
        .await;
    let memory_summaries = state
        .store
        .list_memory_summaries(owner, &chat.character_id)
        .await;
    let memory_context = build_memory_context(&memory_facts, &memory_summaries);
    if let Some(memory_note) = memory_context {
        ai_messages.insert(
            0,
            AiMessage {
                role: AiRole::System,
                content: memory_note,
            },
        );
    }
    let user_ai_message = AiMessage::user(content.to_owned());
    ai_messages.push(user_ai_message.clone());

    Ok(ChatCompletionContext {
        chat,
        ai_messages,
        user_ai_message,
    })
}

async fn complete_and_append_chat_message(
    state: AppState,
    owner: OwnerScope,
    chat_id: Uuid,
    context: ChatCompletionContext,
) -> AppResult<CompletedChatMessage> {
    let ai = AiService::new(state.clone());
    let assistant_ai_message = ai
        .complete_chat(&context.chat.ai_profile_id, &context.ai_messages)
        .await?;

    let user_message = StoredMessage::from_ai_message(context.user_ai_message);
    let assistant_message = StoredMessage::from_ai_message(assistant_ai_message);
    let updated_chat = state
        .store
        .append_chat_messages(
            owner,
            chat_id,
            user_message.clone(),
            assistant_message.clone(),
        )
        .await
        .ok_or(AppError::NotFound)?;

    Ok(CompletedChatMessage {
        user_message,
        assistant_message,
        updated_chat,
    })
}

async fn stream_and_append_chat_message(
    state: AppState,
    owner: OwnerScope,
    chat_id: Uuid,
    context: ChatCompletionContext,
    sender: mpsc::Sender<Result<Event, Infallible>>,
) -> AppResult<CompletedChatMessage> {
    let ai = AiService::new(state.clone());
    let token_sender = sender.clone();
    let assistant_ai_message = ai
        .stream_chat(
            &context.chat.ai_profile_id,
            &context.ai_messages,
            move |event| {
                let token_sender = token_sender.clone();
                async move {
                    match event {
                        AiChatStreamEvent::Token(text) => {
                            send_sse_event(&token_sender, "token", StreamTokenEvent { text }).await;
                        }
                    }

                    Ok(())
                }
            },
        )
        .await?;

    let user_message = StoredMessage::from_ai_message(context.user_ai_message);
    let assistant_message = StoredMessage::from_ai_message(assistant_ai_message);
    let updated_chat = state
        .store
        .append_chat_messages(
            owner,
            chat_id,
            user_message.clone(),
            assistant_message.clone(),
        )
        .await
        .ok_or(AppError::NotFound)?;

    Ok(CompletedChatMessage {
        user_message,
        assistant_message,
        updated_chat,
    })
}

async fn send_sse_event<T: Serialize>(
    sender: &mpsc::Sender<Result<Event, Infallible>>,
    event_name: &'static str,
    payload: T,
) {
    let data = match serde_json::to_string(&payload) {
        Ok(data) => data,
        Err(error) => {
            let fallback = StreamMessageErrorEvent {
                message: format!("failed to serialize SSE event: {error}"),
            };
            serde_json::to_string(&fallback)
                .unwrap_or_else(|_| "{\"message\":\"failed to serialize SSE event\"}".to_owned())
        }
    };

    let _ = sender
        .send(Ok(Event::default().event(event_name).data(data)))
        .await;
}

fn stream_error_message(error: &AppError) -> String {
    match error {
        AppError::Ai(_) => "assistant response failed".to_owned(),
        _ => error.to_string(),
    }
}

fn build_memory_context(
    facts: &[crate::store::MemoryFactRecord],
    summaries: &[crate::store::MemorySummaryRecord],
) -> Option<String> {
    if facts.is_empty() && summaries.is_empty() {
        return None;
    }

    let mut lines = vec![
        "Memory notes from past conversations. Use only as soft guidance; if uncertain, ask follow-up."
            .to_owned(),
    ];

    if !summaries.is_empty() {
        lines.push("Summaries:".to_owned());
        for summary in summaries.iter().take(5) {
            lines.push(format!("- {}", summary.summary));
        }
    }

    if !facts.is_empty() {
        lines.push("Facts:".to_owned());
        for fact in facts.iter().take(15) {
            lines.push(format!(
                "- {} (confidence {:.2})",
                fact.content, fact.confidence
            ));
        }
    }

    Some(lines.join("\n"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::{to_bytes, Body},
        http::{header, HeaderName, Request, StatusCode},
    };
    use reqwest::Client;
    use serde_json::Value;
    use tower::ServiceExt;

    use crate::{app::build_router, config::Config, store::ChatStore};

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
        let session = state.store.create_guest_session().await;
        let owner = OwnerScope::from_session(&session);
        let chat = state
            .store
            .create_chat(owner, "aiko".to_owned(), "aiko_default".to_owned())
            .await;
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
        assert_header_contains(&response, header::CONTENT_TYPE, "text/event-stream");
        assert_header_contains(&response, header::CACHE_CONTROL, "no-cache");
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
        assert_eq!(
            done_payload["messages"].as_array().map(Vec::len),
            Some(2),
            "message_done should return persisted full message list"
        );

        let persisted = state
            .store
            .get_chat(owner, chat.id)
            .await
            .expect("chat should still exist");
        assert_eq!(persisted.messages.len(), 2);
        assert_eq!(persisted.messages[0].content, "hello stream");
        assert_eq!(persisted.messages[1].content, assistant_content);

        state.store.delete_chat(owner, chat.id).await;
    }

    async fn test_state() -> Option<AppState> {
        let database_url = std::env::var("WFCHAT_TEST_DATABASE_URL").ok()?;
        let store = ChatStore::connect(&database_url).await.ok()?;
        Some(AppState {
            config: Config {
                app_host: "127.0.0.1".to_owned(),
                app_port: 0,
                frontend_origin: "http://localhost:5173".to_owned(),
                ai_provider: "mock".to_owned(),
                ai_model: "mock-waifu".to_owned(),
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
            },
            http: Client::new(),
            store,
        })
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
