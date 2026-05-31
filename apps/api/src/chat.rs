use axum::{
    extract::{Path, State},
    http::HeaderMap,
    routing::get,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use uuid::Uuid;

use crate::{
    ai::{AiMessage, AiRole, AiService},
    characters,
    error::{AppError, AppResult},
    state::AppState,
    store::{ChatRecord, StoredMessage},
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/chat-ui/config", get(get_chat_ui_config))
        .route("/personas/{persona_id}/chats", get(list_chats_for_persona).post(create_chat_for_persona))
        .route("/chats/{chat_id}", get(get_chat).delete(delete_chat))
        .route(
            "/chats/{chat_id}/messages",
            axum::routing::post(send_message).delete(clear_messages),
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
    let chats = state
        .store
        .list_chats(session.id)
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
    let character = characters::character_by_id(&persona_id)
        .ok_or_else(|| AppError::BadRequest(format!("unknown character: {persona_id}")))?;
    let chat = state
        .store
        .create_chat(
            session.id,
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
    let chat = state
        .store
        .get_chat(session.id, chat_id)
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
    let content = payload.content.trim();

    if content.is_empty() {
        return Err(AppError::BadRequest("message content is empty".to_owned()));
    }

    let session = state
        .store
        .ensure_session(session_id_from_headers(&headers))
        .await;
    let chat = state
        .store
        .get_chat(session.id, chat_id)
        .await
        .ok_or(AppError::NotFound)?;

    let mut ai_messages = chat
        .messages
        .iter()
        .map(StoredMessage::to_ai_message)
        .collect::<Vec<_>>();
    let memory_facts = state.store.list_memory_facts(session.id, &chat.character_id).await;
    let memory_summaries = state
        .store
        .list_memory_summaries(session.id, &chat.character_id)
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

    let ai = AiService::new(state.clone());
    let assistant_ai_message = ai.complete_chat(&chat.ai_profile_id, &ai_messages).await?;

    let user_message = StoredMessage::from_ai_message(user_ai_message);
    let assistant_message = StoredMessage::from_ai_message(assistant_ai_message);
    let updated_chat = state
        .store
        .append_chat_messages(
            session.id,
            chat_id,
            user_message.clone(),
            assistant_message.clone(),
        )
        .await
        .ok_or(AppError::NotFound)?;

    Ok(Json(SendMessageResponse {
        chat_id,
        user_message: message_response(user_message),
        assistant_message: message_response(assistant_message),
        messages: updated_chat
            .messages
            .into_iter()
            .map(message_response)
            .collect(),
    }))
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
    let chat = state
        .store
        .clear_chat_messages(session.id, chat_id)
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

    if !state.store.delete_chat(session.id, chat_id).await {
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
            lines.push(format!("- {} (confidence {:.2})", fact.content, fact.confidence));
        }
    }

    Some(lines.join("\n"))
}
