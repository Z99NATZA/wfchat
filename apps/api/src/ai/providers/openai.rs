use serde::{Deserialize, Serialize};

use crate::{
    ai::{AiMessage, AiRole},
    characters,
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
        .openai_api_key
        .as_deref()
        .ok_or_else(|| AppError::Ai("OPENAI_API_KEY is not configured".to_owned()))?;

    complete_chat_completions(
        state,
        ChatCompletionsProvider {
            base_url: &state.config.openai_base_url,
            api_key: Some(api_key),
            model: &state.config.openai_model,
            ai_profile_id,
        },
        messages,
    )
    .await
}

pub struct ChatCompletionsProvider<'a> {
    pub base_url: &'a str,
    pub api_key: Option<&'a str>,
    pub model: &'a str,
    pub ai_profile_id: &'a str,
}

pub async fn complete_chat_completions(
    state: &AppState,
    provider: ChatCompletionsProvider<'_>,
    messages: &[AiMessage],
) -> AppResult<AiMessage> {
    let url = format!(
        "{}/chat/completions",
        provider.base_url.trim_end_matches('/')
    );
    let mut request = state.http.post(url);

    if let Some(api_key) = provider.api_key {
        request = request.bearer_auth(api_key);
    }

    let response = request
        .json(&ChatCompletionRequest {
            model: provider.model,
            messages: build_messages(provider.ai_profile_id, messages),
            temperature: 0.8,
        })
        .send()
        .await
        .map_err(|error| AppError::Ai(error.to_string()))?;

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|error| AppError::Ai(error.to_string()))?;

    if !status.is_success() {
        return Err(AppError::Ai(format!("provider returned {status}: {body}")));
    }

    let completion: ChatCompletionResponse =
        serde_json::from_str(&body).map_err(|error| AppError::Ai(error.to_string()))?;
    let content = completion
        .choices
        .into_iter()
        .next()
        .and_then(|choice| choice.message.content)
        .ok_or_else(|| AppError::Ai("provider response did not include content".to_owned()))?;

    Ok(AiMessage::assistant(apply_character_response_guard(
        provider.ai_profile_id,
        content,
    )))
}

fn apply_character_response_guard(ai_profile_id: &str, content: String) -> String {
    if !characters::is_aiko_profile(ai_profile_id) {
        return content;
    }

    content
        .replace("ครับนะ", "ค่ะนะ")
        .replace("ครับผม", "ค่ะ")
        .replace("ครับ", "ค่ะ")
        .replace("คับ", "ค่ะ")
        .replace("ผม", "ไอโกะ")
}

fn build_messages<'a>(ai_profile_id: &str, messages: &'a [AiMessage]) -> Vec<ProviderMessage<'a>> {
    let mut provider_messages = vec![ProviderMessage {
        role: "system",
        content: system_prompt(ai_profile_id),
    }];

    provider_messages.extend(messages.iter().map(|message| ProviderMessage {
        role: role_name(&message.role),
        content: message.content.as_str(),
    }));

    provider_messages
}

fn system_prompt(ai_profile_id: &str) -> &'static str {
    characters::character_by_ai_profile(ai_profile_id)
        .map(|character| character.system_prompt)
        .unwrap_or(
            "You are a helpful chat companion. Reply naturally, stay concise, and keep boundaries respectful.",
        )
}

fn role_name(role: &AiRole) -> &'static str {
    match role {
        AiRole::User => "user",
        AiRole::Assistant => "assistant",
        AiRole::System => "system",
    }
}

#[derive(Serialize)]
struct ChatCompletionRequest<'a> {
    model: &'a str,
    messages: Vec<ProviderMessage<'a>>,
    temperature: f32,
}

#[derive(Serialize)]
struct ProviderMessage<'a> {
    role: &'a str,
    content: &'a str,
}

#[derive(Deserialize)]
struct ChatCompletionResponse {
    choices: Vec<ChatCompletionChoice>,
}

#[derive(Deserialize)]
struct ChatCompletionChoice {
    message: ChatCompletionMessage,
}

#[derive(Deserialize)]
struct ChatCompletionMessage {
    content: Option<String>,
}
