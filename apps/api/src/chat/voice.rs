use super::*;

pub(super) fn chat_voice_credits(config: &crate::config::Config) -> Vec<ChatVoiceCreditResponse> {
    if config.ai_voice_provider != "voicevox" {
        return Vec::new();
    }

    let text = config
        .voicevox_credit
        .as_deref()
        .map(str::trim)
        .filter(|credit| !credit.is_empty())
        .map(str::to_owned)
        .unwrap_or_else(|| format!("VOICEVOX speaker {}", config.voicevox_speaker_id));

    vec![ChatVoiceCreditResponse { text }]
}

pub(super) async fn synthesize_message_speech(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((chat_id, message_id)): Path<(Uuid, Uuid)>,
) -> AppResult<impl IntoResponse> {
    enforce_sensitive_rate_limit(&state, &headers, RateLimitFamily::AssistantSpeech)?;
    let session = state
        .store
        .ensure_session(session_id_from_headers(&headers))
        .await?;
    let owner = OwnerScope::from_session(&session);
    let chat = state
        .store
        .get_chat(owner, chat_id)
        .await?
        .ok_or(AppError::NotFound)?;
    let message = chat
        .messages
        .iter()
        .find(|message| message.id == message_id)
        .ok_or(AppError::NotFound)?;

    if message.role != AiRole::Assistant {
        return Err(AppError::BadRequest(
            "speech is only available for assistant messages".to_owned(),
        ));
    }

    if message.content.trim().is_empty() {
        return Err(AppError::BadRequest(
            "speech is only available for non-empty assistant messages".to_owned(),
        ));
    }

    let audio = VoiceService::new(&state.config, &state.http)
        .stream_assistant_speech(&message.content)
        .await?;
    let body = match audio.body {
        SpeechAudioStreamBody::Bytes(bytes) => axum::body::Body::from(bytes),
        SpeechAudioStreamBody::Stream(stream) => axum::body::Body::from_stream(stream),
    };

    Ok((
        [
            (
                header::CONTENT_TYPE,
                HeaderValue::from_static(audio.content_type),
            ),
            (header::CACHE_CONTROL, HeaderValue::from_static("no-store")),
        ],
        body,
    ))
}

#[derive(Serialize)]
struct TranscribeUserSpeechResponse {
    text: String,
}

pub(super) async fn transcribe_user_speech(
    State(state): State<AppState>,
    headers: HeaderMap,
    mut multipart: Multipart,
) -> AppResult<impl IntoResponse> {
    enforce_sensitive_rate_limit(&state, &headers, RateLimitFamily::UserTranscription)?;
    let _session = state
        .store
        .ensure_session(session_id_from_headers(&headers))
        .await?;
    let mut audio_bytes = None;
    let mut content_type = None;
    let mut filename = None;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|error| AppError::BadRequest(error.to_string()))?
    {
        let Some(name) = field.name().map(str::to_owned) else {
            continue;
        };

        if name != "file" && name != "audio" {
            continue;
        }

        content_type = field.content_type().map(str::to_owned);
        filename = field.file_name().map(str::to_owned);
        let bytes = field
            .bytes()
            .await
            .map_err(|error| AppError::BadRequest(error.to_string()))?;

        if bytes.is_empty() {
            return Err(AppError::BadRequest(
                "speech transcription requires a non-empty audio file".to_owned(),
            ));
        }

        if bytes.len() > MAX_TRANSCRIPTION_AUDIO_BYTES {
            return Err(AppError::BadRequest(
                "speech transcription audio is too large".to_owned(),
            ));
        }

        audio_bytes = Some(bytes.to_vec());
        break;
    }

    let audio_bytes = audio_bytes.ok_or_else(|| {
        AppError::BadRequest("speech transcription requires an audio file".to_owned())
    })?;
    tracing::info!(
        filename = filename.as_deref().unwrap_or(""),
        content_type = content_type.as_deref().unwrap_or(""),
        byte_len = audio_bytes.len(),
        signature = audio_signature(&audio_bytes),
        "received user speech transcription audio"
    );
    let transcript = VoiceService::new(&state.config, &state.http)
        .transcribe_user_speech(audio_bytes, content_type.as_deref(), filename.as_deref())
        .await?;

    Ok((
        [(header::CACHE_CONTROL, HeaderValue::from_static("no-store"))],
        Json(TranscribeUserSpeechResponse {
            text: transcript.text,
        }),
    ))
}

fn audio_signature(bytes: &[u8]) -> String {
    bytes
        .iter()
        .take(12)
        .map(|byte| format!("{byte:02x}"))
        .collect::<Vec<_>>()
        .join("")
}
