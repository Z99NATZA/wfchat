use axum::{
    extract::{Path, State},
    http::HeaderMap,
    routing::{get, patch},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    error::{AppError, AppResult},
    session::session_id_from_headers,
    state::AppState,
    store::{MemoryFactRecord, MemorySummaryRecord, OwnerScope},
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/personas/{persona_id}/memory/facts",
            get(list_memory_facts).post(create_memory_fact),
        )
        .route(
            "/memory/facts/{fact_id}",
            patch(update_memory_fact).delete(delete_memory_fact),
        )
        .route(
            "/personas/{persona_id}/memory/summaries",
            get(list_memory_summaries).post(create_memory_summary),
        )
        .route(
            "/memory/summaries/{summary_id}",
            patch(update_memory_summary).delete(delete_memory_summary),
        )
}

#[derive(Deserialize)]
struct CreateMemoryFactRequest {
    content: String,
    confidence: Option<f32>,
    source_chat_id: Option<Uuid>,
}

#[derive(Deserialize)]
struct CreateMemorySummaryRequest {
    summary: String,
    source_chat_id: Option<Uuid>,
}

#[derive(Deserialize)]
struct UpdateMemoryFactRequest {
    content: String,
    confidence: Option<f32>,
}

#[derive(Deserialize)]
struct UpdateMemorySummaryRequest {
    summary: String,
}

#[derive(Serialize)]
struct MemoryFactResponse {
    id: Uuid,
    character_id: String,
    content: String,
    confidence: f32,
    source_chat_id: Option<Uuid>,
    created_at: u64,
    updated_at: u64,
}

#[derive(Serialize)]
struct MemorySummaryResponse {
    id: Uuid,
    character_id: String,
    summary: String,
    source_chat_id: Option<Uuid>,
    created_at: u64,
}

async fn list_memory_facts(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(persona_id): Path<String>,
) -> AppResult<Json<Vec<MemoryFactResponse>>> {
    let session = state
        .store
        .ensure_session(session_id_from_headers(&headers))
        .await?;
    let owner = OwnerScope::from_session(&session);
    let facts = state.store.list_memory_facts(owner, &persona_id).await?;
    Ok(Json(facts.into_iter().map(memory_fact_response).collect()))
}

async fn create_memory_fact(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(persona_id): Path<String>,
    Json(payload): Json<CreateMemoryFactRequest>,
) -> AppResult<Json<MemoryFactResponse>> {
    let content = payload.content.trim();
    if content.is_empty() {
        return Err(AppError::BadRequest(
            "memory fact content is empty".to_owned(),
        ));
    }
    let confidence = payload.confidence.unwrap_or(0.7).clamp(0.0, 1.0);
    let session = state
        .store
        .ensure_session(session_id_from_headers(&headers))
        .await?;
    let owner = OwnerScope::from_session(&session);
    let fact = state
        .store
        .create_memory_fact(
            owner,
            persona_id,
            content.to_owned(),
            confidence,
            payload.source_chat_id,
        )
        .await?;

    Ok(Json(memory_fact_response(fact)))
}

async fn delete_memory_fact(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(fact_id): Path<Uuid>,
) -> AppResult<Json<serde_json::Value>> {
    let session = state
        .store
        .ensure_session(session_id_from_headers(&headers))
        .await?;
    let owner = OwnerScope::from_session(&session);
    if !state.store.delete_memory_fact(owner, fact_id).await? {
        return Err(AppError::NotFound);
    }
    Ok(Json(serde_json::json!({ "ok": true })))
}

async fn update_memory_fact(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(fact_id): Path<Uuid>,
    Json(payload): Json<UpdateMemoryFactRequest>,
) -> AppResult<Json<MemoryFactResponse>> {
    let content = payload.content.trim();
    if content.is_empty() {
        return Err(AppError::BadRequest(
            "memory fact content is empty".to_owned(),
        ));
    }
    let session = state
        .store
        .ensure_session(session_id_from_headers(&headers))
        .await?;
    let owner = OwnerScope::from_session(&session);
    let updated = state
        .store
        .update_memory_fact(
            owner,
            fact_id,
            content.to_owned(),
            payload.confidence.unwrap_or(0.7).clamp(0.0, 1.0),
        )
        .await?
        .ok_or(AppError::NotFound)?;
    Ok(Json(memory_fact_response(updated)))
}

async fn list_memory_summaries(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(persona_id): Path<String>,
) -> AppResult<Json<Vec<MemorySummaryResponse>>> {
    let session = state
        .store
        .ensure_session(session_id_from_headers(&headers))
        .await?;
    let owner = OwnerScope::from_session(&session);
    let summaries = state
        .store
        .list_memory_summaries(owner, &persona_id)
        .await?;
    Ok(Json(
        summaries.into_iter().map(memory_summary_response).collect(),
    ))
}

async fn create_memory_summary(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(persona_id): Path<String>,
    Json(payload): Json<CreateMemorySummaryRequest>,
) -> AppResult<Json<MemorySummaryResponse>> {
    let summary = payload.summary.trim();
    if summary.is_empty() {
        return Err(AppError::BadRequest("memory summary is empty".to_owned()));
    }
    let session = state
        .store
        .ensure_session(session_id_from_headers(&headers))
        .await?;
    let owner = OwnerScope::from_session(&session);
    let created = state
        .store
        .create_memory_summary(
            owner,
            persona_id,
            summary.to_owned(),
            payload.source_chat_id,
        )
        .await?;
    Ok(Json(memory_summary_response(created)))
}

async fn delete_memory_summary(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(summary_id): Path<Uuid>,
) -> AppResult<Json<serde_json::Value>> {
    let session = state
        .store
        .ensure_session(session_id_from_headers(&headers))
        .await?;
    let owner = OwnerScope::from_session(&session);
    if !state.store.delete_memory_summary(owner, summary_id).await? {
        return Err(AppError::NotFound);
    }
    Ok(Json(serde_json::json!({ "ok": true })))
}

async fn update_memory_summary(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(summary_id): Path<Uuid>,
    Json(payload): Json<UpdateMemorySummaryRequest>,
) -> AppResult<Json<MemorySummaryResponse>> {
    let summary = payload.summary.trim();
    if summary.is_empty() {
        return Err(AppError::BadRequest("memory summary is empty".to_owned()));
    }
    let session = state
        .store
        .ensure_session(session_id_from_headers(&headers))
        .await?;
    let owner = OwnerScope::from_session(&session);
    let updated = state
        .store
        .update_memory_summary(owner, summary_id, summary.to_owned())
        .await?
        .ok_or(AppError::NotFound)?;
    Ok(Json(memory_summary_response(updated)))
}

fn memory_fact_response(fact: MemoryFactRecord) -> MemoryFactResponse {
    MemoryFactResponse {
        id: fact.id,
        character_id: fact.character_id,
        content: fact.content,
        confidence: fact.confidence,
        source_chat_id: fact.source_chat_id,
        created_at: fact.created_at,
        updated_at: fact.updated_at,
    }
}

fn memory_summary_response(summary: MemorySummaryRecord) -> MemorySummaryResponse {
    MemorySummaryResponse {
        id: summary.id,
        character_id: summary.character_id,
        summary: summary.summary,
        source_chat_id: summary.source_chat_id,
        created_at: summary.created_at,
    }
}
