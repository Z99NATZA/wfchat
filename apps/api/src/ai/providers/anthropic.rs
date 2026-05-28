use crate::{
    ai::AiMessage,
    error::{AppError, AppResult},
    state::AppState,
};

pub async fn complete_chat(
    _state: &AppState,
    _ai_profile_id: &str,
    _messages: &[AiMessage],
) -> AppResult<AiMessage> {
    Err(AppError::Ai(
        "anthropic provider adapter is scaffolded but not implemented yet".to_owned(),
    ))
}
