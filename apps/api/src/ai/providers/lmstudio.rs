use crate::{ai::AiMessage, error::AppResult, state::AppState};

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
