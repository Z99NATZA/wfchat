pub mod providers;

use std::future::Future;

use serde::Deserialize;
use serde::Serialize;

use crate::{
    error::{AppError, AppResult},
    state::AppState,
};

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct AiMessage {
    pub role: AiRole,
    pub parts: Vec<AiMessagePart>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AiMessagePart {
    Text { text: String },
    Image(AiImagePart),
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct AiImagePart {
    pub mime_type: String,
    pub bytes: Vec<u8>,
    pub byte_size: i64,
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub sha256: String,
}

impl AiMessage {
    pub fn user(content: String) -> Self {
        Self::text(AiRole::User, content)
    }

    pub fn assistant(content: String) -> Self {
        Self::text(AiRole::Assistant, content)
    }

    pub fn system(content: String) -> Self {
        Self::text(AiRole::System, content)
    }

    pub fn text(role: AiRole, content: String) -> Self {
        Self {
            role,
            parts: text_parts(content),
        }
    }

    pub fn with_parts(role: AiRole, parts: Vec<AiMessagePart>) -> Self {
        Self { role, parts }
    }

    pub fn text_content(&self) -> String {
        self.parts
            .iter()
            .filter_map(|part| match part {
                AiMessagePart::Text { text } => Some(text.as_str()),
                AiMessagePart::Image(_) => None,
            })
            .collect::<Vec<_>>()
            .join("")
    }

    pub fn has_image_parts(&self) -> bool {
        self.parts
            .iter()
            .any(|part| matches!(part, AiMessagePart::Image(_)))
    }
}

fn text_parts(content: String) -> Vec<AiMessagePart> {
    if content.is_empty() {
        Vec::new()
    } else {
        vec![AiMessagePart::Text { text: content }]
    }
}

impl AiMessagePart {
    pub fn text(text: impl Into<String>) -> Self {
        Self::Text { text: text.into() }
    }

    pub fn image(image: AiImagePart) -> Self {
        Self::Image(image)
    }
}

impl AiImagePart {
    pub fn new(
        mime_type: String,
        bytes: Vec<u8>,
        byte_size: i64,
        width: Option<i32>,
        height: Option<i32>,
        sha256: String,
    ) -> Self {
        Self {
            mime_type,
            bytes,
            byte_size,
            width,
            height,
            sha256,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
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
        ensure_provider_supports_messages(provider, messages)?;

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
        ensure_provider_supports_messages(provider, messages)?;

        match provider {
            "mock" => providers::mock::stream_chat(ai_profile_id, messages, on_event).await,
            "openai" => {
                providers::openai::stream_chat(&self.state, ai_profile_id, messages, on_event).await
            }
            "lmstudio" => {
                providers::lmstudio::stream_chat(&self.state, ai_profile_id, messages, on_event)
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
        on_event(AiChatStreamEvent::Token(assistant.text_content())).await?;
        Ok(assistant)
    }
}

fn ensure_provider_supports_messages(provider: &str, messages: &[AiMessage]) -> AppResult<()> {
    if !messages.iter().any(AiMessage::has_image_parts) {
        return Ok(());
    }

    if matches!(provider, "mock" | "openai") {
        return Ok(());
    }

    Err(AppError::BadRequest(
        "image attachments are not supported by the configured AI provider".to_owned(),
    ))
}
