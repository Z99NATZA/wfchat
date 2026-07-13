use super::*;

pub(super) async fn send_message(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(chat_id): Path<Uuid>,
    Json(payload): Json<SendMessageRequest>,
) -> AppResult<Json<SendMessageResponse>> {
    enforce_sensitive_rate_limit(&state, &headers, RateLimitFamily::ChatMessages)?;
    let session = state
        .store
        .ensure_session(session_id_from_headers(&headers))
        .await?;
    let owner = OwnerScope::from_session(&session);
    let context = prepare_chat_completion_context(&state, owner, chat_id, &payload).await?;
    let completed = complete_and_append_chat_message(state, owner, chat_id, context).await?;

    Ok(Json(SendMessageResponse {
        chat_id,
        user_message: message_response(completed.user_message),
        assistant_message: message_response(completed.assistant_message),
        messages: completed
            .updated_chat
            .messages
            .into_iter()
            .map(message_response)
            .collect(),
    }))
}

pub(super) async fn stream_message(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(chat_id): Path<Uuid>,
    Json(payload): Json<SendMessageRequest>,
) -> AppResult<impl IntoResponse> {
    enforce_sensitive_rate_limit(&state, &headers, RateLimitFamily::ChatMessages)?;
    let session = state
        .store
        .ensure_session(session_id_from_headers(&headers))
        .await?;
    let owner = OwnerScope::from_session(&session);
    let context = prepare_chat_completion_context(&state, owner, chat_id, &payload).await?;
    let persona_id = context.chat.character_id.clone();
    let (sender, receiver) = mpsc::channel::<Result<Event, Infallible>>(16);

    tokio::spawn(async move {
        send_sse_event(
            &sender,
            "message_start",
            StreamMessageStartEvent {
                chat_id,
                persona_id,
            },
        )
        .await;

        match stream_and_append_chat_message(state, owner, chat_id, context, sender.clone()).await {
            Ok(completed) => {
                send_sse_event(
                    &sender,
                    "message_done",
                    StreamMessageDoneEvent {
                        chat_id,
                        user_message: message_response(completed.user_message),
                        assistant_message: message_response(completed.assistant_message),
                        messages: completed
                            .updated_chat
                            .messages
                            .into_iter()
                            .map(message_response)
                            .collect(),
                    },
                )
                .await;
            }
            Err(error) => {
                send_sse_event(
                    &sender,
                    "error",
                    StreamMessageErrorEvent {
                        message: stream_error_message(&error),
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
    updated_chat: ChatRecord,
}

pub(super) async fn prepare_chat_completion_context(
    state: &AppState,
    owner: OwnerScope,
    chat_id: Uuid,
    payload: &SendMessageRequest,
) -> AppResult<ChatCompletionContext> {
    let content = payload.content.trim();

    if content.is_empty() && payload.attachments.is_empty() {
        return Err(AppError::BadRequest("message content is empty".to_owned()));
    }

    let chat = state
        .store
        .get_chat(owner, chat_id)
        .await?
        .ok_or(AppError::NotFound)?;
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
    ai_messages.extend(chat.messages.iter().map(StoredMessage::to_ai_message));
    let ai_user_message = build_ai_user_message(state, content, &attachments).await?;
    ai_messages.push(ai_user_message.clone());

    Ok(ChatCompletionContext {
        chat,
        attachment_ids,
        ai_messages,
        user_ai_message: AiMessage::user(content.to_owned()),
    })
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
        return Err(AppError::BadRequest(
            "too many image attachments for one message".to_owned(),
        ));
    }

    let mut attachment_ids = Vec::with_capacity(attachments.len());
    let mut records = Vec::with_capacity(attachments.len());
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
        attachment_ids.push(attachment.id);
        records.push(record);
    }

    Ok(records)
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

    let user_message = StoredMessage::from_ai_message(context.user_ai_message);
    let assistant_message = StoredMessage::from_ai_message(assistant_ai_message);
    let updated_chat = state
        .store
        .append_chat_messages_with_attachments(
            owner,
            chat_id,
            user_message.clone(),
            assistant_message.clone(),
            &context.attachment_ids,
        )
        .await?
        .ok_or(AppError::NotFound)?;
    let user_message = message_from_updated_chat(&updated_chat, user_message);
    let assistant_message = message_from_updated_chat(&updated_chat, assistant_message);

    Ok(CompletedChatMessage {
        user_message,
        assistant_message,
        updated_chat,
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
    let assistant_ai_message = ai
        .stream_chat(
            &context.chat.ai_profile_id,
            &context.ai_messages,
            move |event| {
                let token_sender = token_sender.clone();
                async move {
                    match event {
                        AiChatStreamEvent::Token(text) => {
                            send_sse_event(&token_sender, "token", StreamTokenEvent { text }).await;
                        }
                    }

                    Ok(())
                }
            },
        )
        .await?;

    let user_message = StoredMessage::from_ai_message(context.user_ai_message);
    let assistant_message = StoredMessage::from_ai_message(assistant_ai_message);
    let updated_chat = state
        .store
        .append_chat_messages_with_attachments(
            owner,
            chat_id,
            user_message.clone(),
            assistant_message.clone(),
            &context.attachment_ids,
        )
        .await?
        .ok_or(AppError::NotFound)?;
    let user_message = message_from_updated_chat(&updated_chat, user_message);
    let assistant_message = message_from_updated_chat(&updated_chat, assistant_message);

    Ok(CompletedChatMessage {
        user_message,
        assistant_message,
        updated_chat,
    })
}

fn message_from_updated_chat(chat: &ChatRecord, fallback: StoredMessage) -> StoredMessage {
    chat.messages
        .iter()
        .find(|message| message.id == fallback.id)
        .cloned()
        .unwrap_or(fallback)
}

async fn send_sse_event<T: Serialize>(
    sender: &mpsc::Sender<Result<Event, Infallible>>,
    event_name: &'static str,
    payload: T,
) {
    let data = match serde_json::to_string(&payload) {
        Ok(data) => data,
        Err(error) => {
            let fallback = StreamMessageErrorEvent {
                message: format!("failed to serialize SSE event: {error}"),
            };
            serde_json::to_string(&fallback)
                .unwrap_or_else(|_| "{\"message\":\"failed to serialize SSE event\"}".to_owned())
        }
    };

    let _ = sender
        .send(Ok(Event::default().event(event_name).data(data)))
        .await;
}

pub(super) fn stream_error_message(error: &AppError) -> String {
    match error {
        AppError::Ai(_) => "assistant response failed".to_owned(),
        _ => error.to_string(),
    }
}
