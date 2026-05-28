use crate::ai::AiMessage;

pub fn complete_chat(ai_profile_id: &str, messages: &[AiMessage]) -> AiMessage {
    let last_message = messages
        .last()
        .map(|message| message.content.as_str())
        .unwrap_or("");

    AiMessage::assistant(format!(
        "[{ai_profile_id}] mock reply: I received \"{last_message}\"."
    ))
}
