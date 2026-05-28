use crate::{
    ai::AiMessage,
    error::{AppError, AppResult},
    state::AppState,
};

pub async fn complete_chat(
    state: &AppState,
    ai_profile_id: &str,
    messages: &[AiMessage],
) -> AppResult<AiMessage> {
    let api_key = state
        .config
        .xai_api_key
        .as_deref()
        .ok_or_else(|| AppError::Ai("XAI_API_KEY is not configured".to_owned()))?;

    super::openai::complete_chat_completions(
        state,
        super::openai::ChatCompletionsProvider {
            base_url: &state.config.xai_base_url,
            api_key: Some(api_key),
            model: &state.config.xai_model,
            ai_profile_id,
        },
        messages,
    )
    .await
}
