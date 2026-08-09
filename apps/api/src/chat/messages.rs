use super::*;
use std::sync::{
    atomic::{AtomicUsize, Ordering},
    Arc,
};

pub(super) async fn send_message(
    ConnectInfo(peer_addr): ConnectInfo<SocketAddr>,
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(chat_id): Path<Uuid>,
    payload: Result<Json<SendMessageRequest>, axum::extract::rejection::JsonRejection>,
) -> AppResult<Json<SendMessageResponse>> {
    let payload = send_message_payload(payload)?;
    let session = require_chat_session(&state, &headers).await?;
    enforce_sensitive_rate_limit(
        &state,
        &headers,
        peer_addr,
        session.id,
        RateLimitFamily::ChatMessages,
    )?;
    let _generation_permit = state.generation_limiter.try_acquire(session.id, chat_id)?;
    let owner = OwnerScope::from_session(&session);
    let context = prepare_chat_completion_context(&state, owner, chat_id, &payload).await?;
    let completed = complete_and_append_chat_message(state, owner, chat_id, context).await?;

    Ok(Json(SendMessageResponse {
        chat_id,
        user_message: message_response(completed.user_message),
        assistant_message: message_response(completed.assistant_message),
    }))
}

pub(super) async fn stream_message(
    ConnectInfo(peer_addr): ConnectInfo<SocketAddr>,
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(chat_id): Path<Uuid>,
    payload: Result<Json<SendMessageRequest>, axum::extract::rejection::JsonRejection>,
) -> AppResult<impl IntoResponse> {
    let payload = send_message_payload(payload)?;
    let session = require_chat_session(&state, &headers).await?;
    enforce_sensitive_rate_limit(
        &state,
        &headers,
        peer_addr,
        session.id,
        RateLimitFamily::ChatMessages,
    )?;
    let generation_permit = state.generation_limiter.try_acquire(session.id, chat_id)?;
    let owner = OwnerScope::from_session(&session);
    let context = prepare_chat_completion_context(&state, owner, chat_id, &payload).await?;
    let persona_id = context.chat.character_id.clone();
    let (sender, receiver) = mpsc::channel::<Result<Event, Infallible>>(16);

    tokio::spawn(async move {
        let _generation_permit = generation_permit;
        if send_sse_event(
            &sender,
            "message_start",
            StreamMessageStartEvent {
                chat_id,
                persona_id,
            },
        )
        .await
        .is_err()
        {
            return;
        }

        match stream_and_append_chat_message(state, owner, chat_id, context, sender.clone()).await {
            Ok(completed) => {
                let _ = send_sse_event(
                    &sender,
                    "message_done",
                    StreamMessageDoneEvent {
                        chat_id,
                        user_message: message_response(completed.user_message),
                        assistant_message: message_response(completed.assistant_message),
                    },
                )
                .await;
            }
            Err(error) => {
                let _ = send_sse_event(
                    &sender,
                    "error",
                    StreamMessageErrorEvent {
                        message: stream_error_message(&error),
                        reason: error.reason(),
                    },
                )
                .await;
            }
        }
    });

    let stream = ReceiverStream::new(receiver);
    let response_headers = [
        (header::CACHE_CONTROL, HeaderValue::from_static("no-cache")),
        (
            HeaderName::from_static("x-accel-buffering"),
            HeaderValue::from_static("no"),
        ),
    ];

    Ok((
        response_headers,
        Sse::new(stream).keep_alive(KeepAlive::new().interval(Duration::from_secs(15))),
    ))
}

struct CompletedChatMessage {
    user_message: StoredMessage,
    assistant_message: StoredMessage,
}

pub(super) async fn prepare_chat_completion_context(
    state: &AppState,
    owner: OwnerScope,
    chat_id: Uuid,
    payload: &SendMessageRequest,
) -> AppResult<ChatCompletionContext> {
    let content = payload.content.trim();
    let user_timezone = normalize_user_timezone(payload.timezone.as_deref());

    if content.is_empty() && payload.attachments.is_empty() {
        return Err(AppError::BadRequest("message content is empty".to_owned()));
    }
    if content.chars().count() > state.config.security.chat.message_max_chars {
        return Err(AppError::reasoned(
            axum::http::StatusCode::BAD_REQUEST,
            "bad request: message content is too long",
            ErrorReason::MessageSizeLimit,
            None,
        ));
    }
    if !payload.attachments.is_empty() && !state.config.security.chat.image_upload_enabled {
        return Err(AppError::NotFound);
    }

    let chat = state
        .store
        .get_chat(owner, chat_id)
        .await?
        .ok_or(AppError::NotFound)?;
    ensure_chat_has_turn_capacity(&chat, content, chat_storage_limits(state))?;
    let attachments =
        validate_message_attachment_requests(state, owner, &payload.attachments).await?;
    let attachment_ids = attachments
        .iter()
        .map(|attachment| attachment.id)
        .collect::<Vec<_>>();
    let mut ai_messages = Vec::new();
    if !content.is_empty() {
        if let Ok(Some(context)) = retrieve_memory_context_observed(
            &state.store,
            owner,
            &chat.character_id,
            content,
            &state.memory_telemetry,
        )
        .await
        {
            ai_messages.push(context.message);
        }
    }
    ai_messages.extend(bounded_chat_history(
        &chat.messages,
        state.config.security.chat.context_max_messages,
        state.config.security.chat.context_max_chars,
    ));
    let ai_user_message = build_ai_user_message(state, content, &attachments).await?;
    ai_messages.push(ai_user_message.clone());

    Ok(ChatCompletionContext {
        chat,
        attachment_ids,
        ai_messages,
        user_ai_message: AiMessage::user(content.to_owned()),
        user_timezone,
    })
}

fn bounded_chat_history(
    messages: &[StoredMessage],
    max_messages: usize,
    max_chars: usize,
) -> Vec<AiMessage> {
    let mut remaining_chars = max_chars;
    let mut selected = Vec::new();
    for message in messages.iter().rev().take(max_messages) {
        let message_chars = message.content.chars().count();
        if message_chars > remaining_chars {
            break;
        }
        remaining_chars -= message_chars;
        selected.push(message.to_ai_message());
    }
    selected.reverse();
    selected
}

fn normalize_user_timezone(value: Option<&str>) -> String {
    value
        .map(str::trim)
        .filter(|value| value.parse::<chrono_tz::Tz>().is_ok())
        .unwrap_or("UTC")
        .to_owned()
}

#[cfg(test)]
pub(crate) async fn prepare_text_context_for_memory_evaluation(
    state: &AppState,
    owner: OwnerScope,
    chat_id: Uuid,
    content: &str,
) -> AppResult<Vec<AiMessage>> {
    let payload = SendMessageRequest {
        content: content.to_owned(),
        attachments: Vec::new(),
        timezone: None,
    };
    Ok(
        prepare_chat_completion_context(state, owner, chat_id, &payload)
            .await?
            .ai_messages,
    )
}

async fn validate_message_attachment_requests(
    state: &AppState,
    owner: OwnerScope,
    attachments: &[SendMessageAttachmentRequest],
) -> AppResult<Vec<ChatAttachmentRecord>> {
    if attachments.len() > state.config.chat_attachment_max_images_per_message {
        return Err(AppError::reasoned(
            axum::http::StatusCode::BAD_REQUEST,
            "bad request: too many image attachments for one message",
            ErrorReason::ImageCountLimit,
            None,
        ));
    }

    let mut attachment_ids = Vec::with_capacity(attachments.len());
    let mut records = Vec::with_capacity(attachments.len());
    let mut total_attachment_bytes = 0usize;
    for attachment in attachments {
        if attachment.kind != CHAT_ATTACHMENT_KIND_IMAGE {
            return Err(AppError::BadRequest(
                "only image attachments are supported".to_owned(),
            ));
        }
        if attachment_ids.contains(&attachment.id) {
            return Err(AppError::BadRequest(
                "duplicate image attachment id".to_owned(),
            ));
        }

        let record = state
            .store
            .get_chat_attachment(owner, attachment.id)
            .await?
            .ok_or(AppError::NotFound)?;
        if record.kind != CHAT_ATTACHMENT_KIND_IMAGE
            || record.chat_id.is_some()
            || record.message_id.is_some()
        {
            return Err(AppError::BadRequest(
                "image attachment is not pending".to_owned(),
            ));
        }
        if !is_supported_chat_image_mime_type(&record.mime_type) {
            return Err(AppError::BadRequest(
                "image attachment type is not supported".to_owned(),
            ));
        }
        add_attachment_byte_size(
            &mut total_attachment_bytes,
            record.byte_size,
            state.config.chat_attachment_max_total_bytes_per_message,
        )?;
        attachment_ids.push(attachment.id);
        records.push(record);
    }

    Ok(records)
}

fn add_attachment_byte_size(total: &mut usize, byte_size: i64, maximum: usize) -> AppResult<()> {
    let byte_size = usize::try_from(byte_size)
        .map_err(|_| AppError::BadRequest("image attachment metadata is invalid".to_owned()))?;
    let next_total = total.checked_add(byte_size).ok_or_else(|| {
        AppError::BadRequest("image attachments exceed total byte limit".to_owned())
    })?;
    if next_total > maximum {
        return Err(AppError::reasoned(
            axum::http::StatusCode::BAD_REQUEST,
            "bad request: image attachments exceed total byte limit",
            ErrorReason::ImageSizeLimit,
            None,
        ));
    }
    *total = next_total;
    Ok(())
}

async fn build_ai_user_message(
    state: &AppState,
    content: &str,
    attachments: &[ChatAttachmentRecord],
) -> AppResult<AiMessage> {
    let mut parts = Vec::new();
    if !content.is_empty() {
        parts.push(AiMessagePart::text(content.to_owned()));
    }

    for attachment in attachments {
        let bytes = read_attachment_bytes(
            &state.config.chat_attachment_upload_dir,
            &attachment.storage_key,
        )
        .await?;
        parts.push(AiMessagePart::image(AiImagePart::new(
            attachment.mime_type.clone(),
            bytes,
            attachment.byte_size,
            attachment.width,
            attachment.height,
            attachment.sha256.clone(),
        )));
    }

    Ok(AiMessage::with_parts(AiRole::User, parts))
}

async fn complete_and_append_chat_message(
    state: AppState,
    owner: OwnerScope,
    chat_id: Uuid,
    context: ChatCompletionContext,
) -> AppResult<CompletedChatMessage> {
    let ai = AiService::new(state.clone());
    let assistant_ai_message = ai
        .complete_chat(&context.chat.ai_profile_id, &context.ai_messages)
        .await?;
    ensure_output_within_limit(
        &assistant_ai_message,
        state.config.security.chat.output_max_chars,
    )?;

    let user_message = StoredMessage::from_ai_message(context.user_ai_message);
    let assistant_message = StoredMessage::from_ai_message(assistant_ai_message);
    let outcome = state
        .store
        .append_chat_messages_limited(
            owner,
            chat_id,
            user_message,
            assistant_message,
            &context.attachment_ids,
            &context.user_timezone,
            chat_storage_limits(&state),
        )
        .await?;
    let (user_message, assistant_message) = completed_messages(outcome)?;

    Ok(CompletedChatMessage {
        user_message,
        assistant_message,
    })
}

async fn stream_and_append_chat_message(
    state: AppState,
    owner: OwnerScope,
    chat_id: Uuid,
    context: ChatCompletionContext,
    sender: mpsc::Sender<Result<Event, Infallible>>,
) -> AppResult<CompletedChatMessage> {
    let ai = AiService::new(state.clone());
    let token_sender = sender.clone();
    let output_chars = Arc::new(AtomicUsize::new(0));
    let callback_output_chars = output_chars.clone();
    let output_max_chars = state.config.security.chat.output_max_chars;
    let assistant_ai_message = ai
        .stream_chat(
            &context.chat.ai_profile_id,
            &context.ai_messages,
            move |event| {
                let token_sender = token_sender.clone();
                let callback_output_chars = callback_output_chars.clone();
                async move {
                    match event {
                        AiChatStreamEvent::Token(text) => {
                            reserve_output_chunk(&callback_output_chars, &text, output_max_chars)?;
                            send_sse_event(&token_sender, "token", StreamTokenEvent { text })
                                .await?;
                        }
                    }

                    Ok(())
                }
            },
        )
        .await?;
    ensure_output_within_limit(&assistant_ai_message, output_max_chars)?;

    let user_message = StoredMessage::from_ai_message(context.user_ai_message);
    let assistant_message = StoredMessage::from_ai_message(assistant_ai_message);
    let outcome = state
        .store
        .append_chat_messages_limited(
            owner,
            chat_id,
            user_message,
            assistant_message,
            &context.attachment_ids,
            &context.user_timezone,
            chat_storage_limits(&state),
        )
        .await?;
    let (user_message, assistant_message) = completed_messages(outcome)?;

    Ok(CompletedChatMessage {
        user_message,
        assistant_message,
    })
}

fn ensure_output_within_limit(message: &AiMessage, max_chars: usize) -> AppResult<()> {
    if message.text_content().chars().count() > max_chars {
        Err(output_limit_error())
    } else {
        Ok(())
    }
}

fn reserve_output_chunk(counter: &AtomicUsize, chunk: &str, max_chars: usize) -> AppResult<()> {
    let chunk_chars = chunk.chars().count();
    counter
        .fetch_update(Ordering::Relaxed, Ordering::Relaxed, |current| {
            current
                .checked_add(chunk_chars)
                .filter(|next| *next <= max_chars)
        })
        .map(|_| ())
        .map_err(|_| output_limit_error())
}

fn output_limit_error() -> AppError {
    AppError::reasoned(
        axum::http::StatusCode::BAD_GATEWAY,
        "assistant response failed",
        ErrorReason::AssistantOutputSizeLimit,
        None,
    )
}

fn completed_messages(
    outcome: AppendChatMessagesOutcome,
) -> AppResult<(StoredMessage, StoredMessage)> {
    match outcome {
        AppendChatMessagesOutcome::Appended {
            user_message,
            assistant_message,
        } => Ok((user_message, assistant_message)),
        AppendChatMessagesOutcome::Unavailable => Err(AppError::NotFound),
        AppendChatMessagesOutcome::LimitReached => Err(chat_storage_limit_error()),
    }
}

fn ensure_chat_has_turn_capacity(
    chat: &ChatRecord,
    user_content: &str,
    limits: ChatStorageLimits,
) -> AppResult<()> {
    let message_count_fits = chat
        .messages
        .len()
        .checked_add(2)
        .is_some_and(|count| count <= limits.max_messages_per_chat);
    let stored_chars = chat.messages.iter().try_fold(0usize, |total, message| {
        total.checked_add(message.content.chars().count())
    });
    let stored_chars_fit = stored_chars
        .and_then(|total| total.checked_add(user_content.chars().count()))
        .is_some_and(|count| count <= limits.max_stored_chars_per_chat);
    if !message_count_fits || !stored_chars_fit {
        return Err(chat_storage_limit_error());
    }

    Ok(())
}

async fn send_sse_event<T: Serialize>(
    sender: &mpsc::Sender<Result<Event, Infallible>>,
    event_name: &'static str,
    payload: T,
) -> AppResult<()> {
    let data = match serde_json::to_string(&payload) {
        Ok(data) => data,
        Err(_) => {
            let fallback = StreamMessageErrorEvent {
                message: "failed to serialize SSE event".to_owned(),
                reason: None,
            };
            serde_json::to_string(&fallback)
                .unwrap_or_else(|_| "{\"message\":\"failed to serialize SSE event\"}".to_owned())
        }
    };

    sender
        .send(Ok(Event::default().event(event_name).data(data)))
        .await
        .map_err(|_| AppError::ClientDisconnected)
}

fn send_message_payload(
    payload: Result<Json<SendMessageRequest>, axum::extract::rejection::JsonRejection>,
) -> AppResult<SendMessageRequest> {
    match payload {
        Ok(Json(payload)) => Ok(payload),
        Err(error) if error.status() == axum::http::StatusCode::PAYLOAD_TOO_LARGE => {
            Err(AppError::reasoned(
                axum::http::StatusCode::PAYLOAD_TOO_LARGE,
                "payload too large",
                ErrorReason::RequestSizeLimit,
                None,
            ))
        }
        Err(error) => Err(AppError::BadRequest(error.body_text())),
    }
}

pub(super) fn stream_error_message(error: &AppError) -> String {
    match error {
        AppError::Ai(_) => "assistant response failed".to_owned(),
        _ => error.to_string(),
    }
}

#[cfg(test)]
mod unit_tests {
    use super::*;
    use crate::rate_limit::{RateLimitPolicies, RateLimitPolicy, RateLimiter};

    fn stored_message(content: &str) -> StoredMessage {
        StoredMessage {
            id: Uuid::new_v4(),
            role: AiRole::User,
            content: content.to_owned(),
            attachments: Vec::new(),
            created_at: 1,
        }
    }

    #[test]
    fn bounded_history_keeps_only_recent_messages_within_both_limits() {
        let messages = vec![
            stored_message("old"),
            stored_message("middle"),
            stored_message("new"),
        ];

        let bounded = bounded_chat_history(&messages, 2, 9);

        assert_eq!(bounded.len(), 2);
        assert_eq!(bounded[0].text_content(), "middle");
        assert_eq!(bounded[1].text_content(), "new");
    }

    #[tokio::test]
    async fn sse_send_reports_client_disconnect() {
        let (sender, receiver) = mpsc::channel(1);
        drop(receiver);

        let result = send_sse_event(
            &sender,
            "token",
            StreamTokenEvent {
                text: "x".to_owned(),
            },
        )
        .await;

        assert!(matches!(result, Err(AppError::ClientDisconnected)));
    }

    #[test]
    fn output_chunk_limit_counts_unicode_and_rejects_whole_offending_chunk() {
        let counter = AtomicUsize::new(0);

        reserve_output_chunk(&counter, "ไทย", 4).expect("three Unicode scalars should pass");
        assert!(reserve_output_chunk(&counter, "ดี", 4).is_err());
        assert_eq!(counter.load(Ordering::Relaxed), 3);
    }

    #[test]
    fn output_limit_counts_the_response_guards_buffered_tail() {
        let chunks = crate::ai::providers::openai::guarded_stream_chunks_for_test(
            "aiko_default",
            &["hello ครั"],
        );
        assert_eq!(chunks, ["hello ", "ครั"]);

        let counter = AtomicUsize::new(0);
        let max_chars = chunks[0].chars().count();
        reserve_output_chunk(&counter, &chunks[0], max_chars)
            .expect("guarded prefix should fit exactly");
        assert!(reserve_output_chunk(&counter, &chunks[1], max_chars).is_err());
        assert_eq!(counter.load(Ordering::Relaxed), max_chars);
    }

    #[test]
    fn total_attachment_bytes_are_checked_incrementally_from_metadata() {
        let mut total = 0;
        add_attachment_byte_size(&mut total, 6, 10).expect("first attachment should fit");
        let error = add_attachment_byte_size(&mut total, 5, 10)
            .expect_err("combined attachment metadata should exceed the limit");

        assert_eq!(total, 6);
        assert_eq!(
            error.to_string(),
            "bad request: image attachments exceed total byte limit"
        );
    }

    #[test]
    fn json_and_sse_chat_rate_limit_checks_session_ip_and_global_atomically() {
        let session_id = Uuid::new_v4();
        let identities = super::super::sensitive_rate_limit_identities(
            &HeaderMap::new(),
            "192.0.2.8:1234".parse().unwrap(),
            session_id,
            RateLimitFamily::ChatMessages,
            false,
            &[],
        );
        assert_eq!(
            identities,
            vec![
                RateLimitIdentity::Session(session_id),
                RateLimitIdentity::Ip("192.0.2.8".to_owned()),
                RateLimitIdentity::Global,
            ]
        );

        for blocked_index in 0..identities.len() {
            let limiter = RateLimiter::new(
                RateLimitPolicies::default()
                    .with_family_limit(
                        RateLimitFamily::ChatMessages,
                        RateLimitPolicy::per_minute(1),
                    )
                    .with_chat_global_limit(RateLimitPolicy::per_minute(1)),
            );
            limiter
                .check(
                    RateLimitFamily::ChatMessages,
                    identities[blocked_index].clone(),
                )
                .expect("selected identity should be exhausted exactly once");

            assert!(matches!(
                limiter.check_many(RateLimitFamily::ChatMessages, identities.clone()),
                Err(AppError::RateLimited)
            ));
            for (index, identity) in identities.iter().enumerate() {
                if index != blocked_index {
                    limiter
                        .check(RateLimitFamily::ChatMessages, identity.clone())
                        .expect("a rejected request must not consume another identity");
                }
            }
        }
    }

    #[test]
    fn upload_tts_and_transcription_rate_limits_are_atomic_without_global() {
        let session_id = Uuid::new_v4();
        for family in [
            RateLimitFamily::ImageUpload,
            RateLimitFamily::AssistantSpeech,
            RateLimitFamily::UserTranscription,
        ] {
            let identities = super::super::sensitive_rate_limit_identities(
                &HeaderMap::new(),
                "192.0.2.9:1234".parse().unwrap(),
                session_id,
                family,
                false,
                &[],
            );
            assert_eq!(
                identities,
                vec![
                    RateLimitIdentity::Session(session_id),
                    RateLimitIdentity::Ip("192.0.2.9".to_owned()),
                ]
            );

            let limiter = RateLimiter::new(
                RateLimitPolicies::default()
                    .with_family_limit(family, RateLimitPolicy::per_minute(1)),
            );
            limiter
                .check_many(family, identities.clone())
                .expect("session and IP should pass together");
            limiter
                .check(family, RateLimitIdentity::Global)
                .expect("media request must not consume a global bucket");

            for blocked_index in 0..identities.len() {
                let limiter = RateLimiter::new(
                    RateLimitPolicies::default()
                        .with_family_limit(family, RateLimitPolicy::per_minute(1)),
                );
                limiter
                    .check(family, identities[blocked_index].clone())
                    .expect("selected identity should be exhausted exactly once");

                assert!(matches!(
                    limiter.check_many(family, identities.clone()),
                    Err(AppError::RateLimited)
                ));
                limiter
                    .check(family, identities[1 - blocked_index].clone())
                    .expect("a rejected request must not consume the other identity");
            }
        }
    }
}
