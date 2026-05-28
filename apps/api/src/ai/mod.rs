pub mod providers;

use serde::Deserialize;
use serde::Serialize;

use crate::{
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
}
