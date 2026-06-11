pub mod providers;

use std::future::Future;

use serde::Deserialize;
use serde::Serialize;

use crate::{
    characters,
    error::{AppError, AppResult},
    state::AppState,
};

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct AiMessage {
    pub role: AiRole,
    pub content: String,
}

impl AiMessage {
    pub fn user(content: String) -> Self {
        Self {
            role: AiRole::User,
            content,
        }
    }

    pub fn assistant(content: String) -> Self {
        Self {
            role: AiRole::Assistant,
            content,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum AiRole {
    User,
    Assistant,
    System,
}

pub enum AiChatStreamEvent {
    Token(String),
}

#[derive(Clone)]
pub struct AiService {
    state: AppState,
}

impl AiService {
    pub fn new(state: AppState) -> Self {
        Self { state }
    }

    pub async fn complete_chat(
        &self,
        ai_profile_id: &str,
        messages: &[AiMessage],
    ) -> AppResult<AiMessage> {
        let provider = self.state.config.ai_provider.as_str();

        match provider {
            "mock" => Ok(providers::mock::complete_chat(ai_profile_id, messages)),
            "openai" => {
                providers::openai::complete_chat(&self.state, ai_profile_id, messages).await
            }
            "lmstudio" => {
                providers::lmstudio::complete_chat(&self.state, ai_profile_id, messages).await
            }
            "xai" => providers::xai::complete_chat(&self.state, ai_profile_id, messages).await,
            "anthropic" | "claude" => {
                providers::anthropic::complete_chat(&self.state, ai_profile_id, messages).await
            }
            other => Err(AppError::BadRequest(format!(
                "unknown ai provider: {other}"
            ))),
        }
    }

    pub async fn stream_chat<F, Fut>(
        &self,
        ai_profile_id: &str,
        messages: &[AiMessage],
        on_event: F,
    ) -> AppResult<AiMessage>
    where
        F: FnMut(AiChatStreamEvent) -> Fut,
        Fut: Future<Output = AppResult<()>>,
    {
        let provider = self.state.config.ai_provider.as_str();

        match provider {
            "mock" => providers::mock::stream_chat(ai_profile_id, messages, on_event).await,
            "openai" if characters::is_aiko_profile(ai_profile_id) => {
                self.stream_chat_fallback(ai_profile_id, messages, on_event)
                    .await
            }
            "openai" => {
                providers::openai::stream_chat(&self.state, ai_profile_id, messages, on_event).await
            }
            "lmstudio" if characters::is_aiko_profile(ai_profile_id) => {
                self.stream_chat_fallback(ai_profile_id, messages, on_event)
                    .await
            }
            "lmstudio" => {
                providers::lmstudio::stream_chat(&self.state, ai_profile_id, messages, on_event)
                    .await
            }
            "xai" if characters::is_aiko_profile(ai_profile_id) => {
                self.stream_chat_fallback(ai_profile_id, messages, on_event)
                    .await
            }
            "xai" => {
                providers::xai::stream_chat(&self.state, ai_profile_id, messages, on_event).await
            }
            "anthropic" | "claude" => {
                self.stream_chat_fallback(ai_profile_id, messages, on_event)
                    .await
            }
            other => Err(AppError::BadRequest(format!(
                "unknown ai provider: {other}"
            ))),
        }
    }

    async fn stream_chat_fallback<F, Fut>(
        &self,
        ai_profile_id: &str,
        messages: &[AiMessage],
        mut on_event: F,
    ) -> AppResult<AiMessage>
    where
        F: FnMut(AiChatStreamEvent) -> Fut,
        Fut: Future<Output = AppResult<()>>,
    {
        let assistant = self.complete_chat(ai_profile_id, messages).await?;
        on_event(AiChatStreamEvent::Token(assistant.content.clone())).await?;
        Ok(assistant)
    }
}
