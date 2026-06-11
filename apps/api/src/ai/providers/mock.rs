use std::{future::Future, time::Duration};

use tokio::time::sleep;

use crate::{
    ai::{AiChatStreamEvent, AiMessage},
    error::AppResult,
};

pub fn complete_chat(ai_profile_id: &str, messages: &[AiMessage]) -> AiMessage {
    let last_message = messages
        .last()
        .map(|message| message.content.as_str())
        .unwrap_or("");

    AiMessage::assistant(format!(
        "[{ai_profile_id}] mock reply: I received \"{last_message}\"."
    ))
}

pub async fn stream_chat<F, Fut>(
    ai_profile_id: &str,
    messages: &[AiMessage],
    mut on_event: F,
) -> AppResult<AiMessage>
where
    F: FnMut(AiChatStreamEvent) -> Fut,
    Fut: Future<Output = AppResult<()>>,
{
    let assistant = complete_chat(ai_profile_id, messages);

    for token in split_mock_tokens(&assistant.content) {
        on_event(AiChatStreamEvent::Token(token)).await?;
        sleep(Duration::from_millis(80)).await;
    }

    Ok(assistant)
}

fn split_mock_tokens(content: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut current = String::new();

    for character in content.chars() {
        current.push(character);
        if character.is_whitespace() {
            tokens.push(current);
            current = String::new();
        }
    }

    if !current.is_empty() {
        tokens.push(current);
    }

    tokens
}
