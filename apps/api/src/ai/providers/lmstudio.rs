use std::future::Future;

use crate::{
    ai::{AiChatStreamEvent, AiMessage},
    error::AppResult,
    state::AppState,
};

pub async fn complete_chat(
    state: &AppState,
    ai_profile_id: &str,
    messages: &[AiMessage],
) -> AppResult<AiMessage> {
    super::openai::complete_chat_completions(
        state,
        super::openai::ChatCompletionsProvider {
            base_url: &state.config.lmstudio_base_url,
            api_key: None,
            model: &state.config.lmstudio_model,
            ai_profile_id,
        },
        messages,
    )
    .await
}

pub async fn stream_chat<F, Fut>(
    state: &AppState,
    ai_profile_id: &str,
    messages: &[AiMessage],
    on_event: F,
) -> AppResult<AiMessage>
where
    F: FnMut(AiChatStreamEvent) -> Fut,
    Fut: Future<Output = AppResult<()>>,
{
    super::openai::stream_chat_completions(
        state,
        super::openai::ChatCompletionsProvider {
            base_url: &state.config.lmstudio_base_url,
            api_key: None,
            model: &state.config.lmstudio_model,
            ai_profile_id,
        },
        messages,
        on_event,
    )
    .await
}
