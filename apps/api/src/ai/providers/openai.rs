use std::future::Future;

use serde::{Deserialize, Serialize};
use tokio_stream::StreamExt;

use crate::{
    ai::{AiChatStreamEvent, AiMessage, AiRole},
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
            stream: false,
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
    let api_key = state
        .config
        .openai_api_key
        .as_deref()
        .ok_or_else(|| AppError::Ai("OPENAI_API_KEY is not configured".to_owned()))?;

    stream_chat_completions(
        state,
        ChatCompletionsProvider {
            base_url: &state.config.openai_base_url,
            api_key: Some(api_key),
            model: &state.config.openai_model,
            ai_profile_id,
        },
        messages,
        on_event,
    )
    .await
}

pub async fn stream_chat_completions<F, Fut>(
    state: &AppState,
    provider: ChatCompletionsProvider<'_>,
    messages: &[AiMessage],
    mut on_event: F,
) -> AppResult<AiMessage>
where
    F: FnMut(AiChatStreamEvent) -> Fut,
    Fut: Future<Output = AppResult<()>>,
{
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
            stream: true,
        })
        .send()
        .await
        .map_err(|error| AppError::Ai(error.to_string()))?;

    let status = response.status();
    if !status.is_success() {
        let body = response
            .text()
            .await
            .map_err(|error| AppError::Ai(error.to_string()))?;
        return Err(AppError::Ai(format!("provider returned {status}: {body}")));
    }

    let mut body_stream = response.bytes_stream();
    let mut buffer = String::new();
    let mut guard = StreamingResponseGuard::new(provider.ai_profile_id);

    while let Some(chunk) = body_stream.next().await {
        let chunk = chunk.map_err(|error| AppError::Ai(error.to_string()))?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));
        buffer = buffer.replace("\r\n", "\n").replace('\r', "\n");

        while let Some(frame_end_index) = buffer.find("\n\n") {
            let frame = buffer[..frame_end_index].to_owned();
            buffer = buffer[frame_end_index + 2..].to_owned();

            if process_stream_frame(&frame, &mut guard, &mut on_event).await? {
                emit_guarded_tail(&mut guard, &mut on_event).await?;
                return final_stream_message(guard.content().to_owned());
            }
        }
    }

    if !buffer.trim().is_empty() && process_stream_frame(&buffer, &mut guard, &mut on_event).await?
    {
        emit_guarded_tail(&mut guard, &mut on_event).await?;
        return final_stream_message(guard.content().to_owned());
    }

    emit_guarded_tail(&mut guard, &mut on_event).await?;
    final_stream_message(guard.content().to_owned())
}

fn final_stream_message(content: String) -> AppResult<AiMessage> {
    if content.is_empty() {
        return Err(AppError::Ai(
            "provider stream did not include content".to_owned(),
        ));
    }

    Ok(AiMessage::assistant(content))
}

async fn process_stream_frame<F, Fut>(
    frame: &str,
    guard: &mut StreamingResponseGuard,
    on_event: &mut F,
) -> AppResult<bool>
where
    F: FnMut(AiChatStreamEvent) -> Fut,
    Fut: Future<Output = AppResult<()>>,
{
    for line in frame.lines() {
        let line = line.trim();
        if !line.starts_with("data:") {
            continue;
        }

        let data = line.strip_prefix("data:").unwrap_or_default().trim_start();
        if data == "[DONE]" {
            return Ok(true);
        }

        let chunk: ChatCompletionStreamChunk =
            serde_json::from_str(data).map_err(|error| AppError::Ai(error.to_string()))?;
        for choice in chunk.choices {
            if let Some(delta) = choice.delta.content {
                if delta.is_empty() {
                    continue;
                }
                if let Some(token) = guard.push_delta(&delta) {
                    on_event(AiChatStreamEvent::Token(token)).await?;
                }
            }
        }
    }

    Ok(false)
}

async fn emit_guarded_tail<F, Fut>(
    guard: &mut StreamingResponseGuard,
    on_event: &mut F,
) -> AppResult<()>
where
    F: FnMut(AiChatStreamEvent) -> Fut,
    Fut: Future<Output = AppResult<()>>,
{
    if let Some(token) = guard.finish() {
        on_event(AiChatStreamEvent::Token(token)).await?;
    }

    Ok(())
}

fn apply_character_response_guard(ai_profile_id: &str, content: String) -> String {
    if !characters::is_aiko_profile(ai_profile_id) {
        return content;
    }

    apply_aiko_response_guard(content)
}

fn apply_aiko_response_guard(content: String) -> String {
    AIKO_RESPONSE_GUARD_REPLACEMENTS
        .iter()
        .fold(content, |guarded, (from, to)| guarded.replace(from, to))
}

struct StreamingResponseGuard {
    enabled: bool,
    pending: String,
    content: String,
}

const AIKO_RESPONSE_GUARD_REPLACEMENTS: [(&str, &str); 5] = [
    ("ครับนะ", "ค่ะนะ"),
    ("ครับผม", "ค่ะ"),
    ("ครับ", "ค่ะ"),
    ("คับ", "ค่ะ"),
    ("ผม", "ไอโกะ"),
];

impl StreamingResponseGuard {
    fn new(ai_profile_id: &str) -> Self {
        Self {
            enabled: characters::is_aiko_profile(ai_profile_id),
            pending: String::new(),
            content: String::new(),
        }
    }

    fn push_delta(&mut self, delta: &str) -> Option<String> {
        if !self.enabled {
            self.content.push_str(delta);
            return Some(delta.to_owned());
        }

        self.pending.push_str(delta);
        let split_index = aiko_guard_safe_split_index(&self.pending)?;
        let tail = self.pending.split_off(split_index);
        let safe_prefix = std::mem::replace(&mut self.pending, tail);
        let guarded = apply_aiko_response_guard(safe_prefix);

        if guarded.is_empty() {
            return None;
        }

        self.content.push_str(&guarded);
        Some(guarded)
    }

    fn finish(&mut self) -> Option<String> {
        if self.pending.is_empty() {
            return None;
        }

        let token = if self.enabled {
            apply_aiko_response_guard(std::mem::take(&mut self.pending))
        } else {
            std::mem::take(&mut self.pending)
        };

        if token.is_empty() {
            return None;
        }

        self.content.push_str(&token);
        Some(token)
    }

    fn content(&self) -> &str {
        &self.content
    }
}

fn aiko_guard_safe_split_index(content: &str) -> Option<usize> {
    if content.is_empty() {
        return None;
    }

    let mut split_index = content.len();
    for (from, _) in AIKO_RESPONSE_GUARD_REPLACEMENTS {
        for (prefix_end_index, _) in from.char_indices().skip(1) {
            let prefix = &from[..prefix_end_index];
            if content.ends_with(prefix) {
                split_index = split_index.min(content.len() - prefix.len());
            }
        }
    }

    (split_index > 0).then_some(split_index)
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
    stream: bool,
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

#[derive(Deserialize)]
struct ChatCompletionStreamChunk {
    choices: Vec<ChatCompletionStreamChoice>,
}

#[derive(Deserialize)]
struct ChatCompletionStreamChoice {
    delta: ChatCompletionStreamDelta,
}

#[derive(Deserialize)]
struct ChatCompletionStreamDelta {
    content: Option<String>,
}

#[cfg(test)]
mod tests {
    use std::{cell::RefCell, rc::Rc};

    use super::*;

    #[tokio::test]
    async fn stream_frame_emits_token_and_detects_done() {
        let emitted = Rc::new(RefCell::new(Vec::new()));
        let emitted_events = emitted.clone();
        let mut on_event = move |event| {
            let emitted_events = emitted_events.clone();
            async move {
                match event {
                    AiChatStreamEvent::Token(text) => emitted_events.borrow_mut().push(text),
                }
                Ok(())
            }
        };
        let mut guard = StreamingResponseGuard::new("other_profile");
        let frame = concat!(
            "data: {\"choices\":[{\"delta\":{\"content\":\"hel\"}}]}\n",
            "data: {\"choices\":[{\"delta\":{\"content\":\"lo\"}}]}\n",
            "data: [DONE]\n",
        );

        let is_done = process_stream_frame(frame, &mut guard, &mut on_event)
            .await
            .expect("frame should parse");

        assert!(is_done);
        assert_eq!(emitted.borrow().as_slice(), ["hel", "lo"]);
        assert_eq!(guard.content(), "hello");
    }

    #[tokio::test]
    async fn stream_frame_ignores_role_only_and_empty_deltas() {
        let emitted = Rc::new(RefCell::new(Vec::new()));
        let emitted_events = emitted.clone();
        let mut on_event = move |event| {
            let emitted_events = emitted_events.clone();
            async move {
                match event {
                    AiChatStreamEvent::Token(text) => emitted_events.borrow_mut().push(text),
                }
                Ok(())
            }
        };
        let mut guard = StreamingResponseGuard::new("other_profile");
        let frame = concat!(
            "data: {\"choices\":[{\"delta\":{\"role\":\"assistant\"}}]}\n",
            "data: {\"choices\":[{\"delta\":{\"content\":\"\"}}]}\n",
        );

        let is_done = process_stream_frame(frame, &mut guard, &mut on_event)
            .await
            .expect("frame should parse");

        assert!(!is_done);
        assert!(emitted.borrow().is_empty());
        assert_eq!(guard.content(), "");
    }

    #[tokio::test]
    async fn stream_frame_returns_error_for_malformed_json() {
        let mut on_event = |_event| async { Ok(()) };
        let mut guard = StreamingResponseGuard::new("other_profile");

        let error = process_stream_frame("data: {not-json}\n", &mut guard, &mut on_event)
            .await
            .expect_err("malformed provider frames should fail");

        assert!(error.to_string().contains("upstream ai error"));
    }

    #[test]
    fn final_stream_message_rejects_empty_content() {
        let error = final_stream_message(String::new()).expect_err("empty stream should fail");

        assert_eq!(
            error.to_string(),
            "upstream ai error: provider stream did not include content"
        );
    }

    #[test]
    fn streaming_guard_matches_full_aiko_guard_across_chunk_boundaries() {
        let chunks = ["สวัสดีครั", "บนะ ผ", "มเองคั", "บ"];
        let mut guard = StreamingResponseGuard::new("aiko_default");
        let mut emitted = String::new();

        for chunk in chunks {
            if let Some(token) = guard.push_delta(chunk) {
                emitted.push_str(&token);
            }
        }
        if let Some(token) = guard.finish() {
            emitted.push_str(&token);
        }

        let full_content = chunks.join("");
        assert_eq!(
            emitted,
            apply_character_response_guard("aiko_default", full_content)
        );
        assert!(!emitted.contains("ครับ"));
        assert!(!emitted.contains("คับ"));
        assert!(!emitted.contains("ผม"));
    }

    #[test]
    fn streaming_guard_holds_boundary_sensitive_tail() {
        let mut guard = StreamingResponseGuard::new("aiko_default");

        assert_eq!(guard.push_delta("ครั"), None);
        assert_eq!(guard.push_delta("บนะ สบายดี"), Some("ค่ะนะ สบายดี".to_owned()));
        assert_eq!(guard.finish(), None);
        assert_eq!(guard.content(), "ค่ะนะ สบายดี");
    }

    #[test]
    fn streaming_guard_passes_unguarded_profiles_through() {
        let mut guard = StreamingResponseGuard::new("other_profile");

        assert_eq!(guard.push_delta("ครับ"), Some("ครับ".to_owned()));
        assert_eq!(guard.push_delta("ผม"), Some("ผม".to_owned()));
        assert_eq!(guard.finish(), None);
        assert_eq!(guard.content(), "ครับผม");
    }
}
