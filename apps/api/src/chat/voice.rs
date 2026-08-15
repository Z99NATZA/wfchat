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
    ConnectInfo(peer_addr): ConnectInfo<SocketAddr>,
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((chat_id, message_id)): Path<(Uuid, Uuid)>,
) -> AppResult<impl IntoResponse> {
    if !state.config.security.chat.tts_enabled {
        return Err(AppError::NotFound);
    }
    let action = AuthorizationAction::SynthesizeMessageSpeech;
    let session = require_voice_session(&state, &headers, action).await?;
    if let Err(error) = enforce_sensitive_rate_limit(
        &state,
        &headers,
        peer_addr,
        session.id,
        RateLimitFamily::AssistantSpeech,
    ) {
        if matches!(error, AppError::RateLimited) {
            voice_rate_limit_rejected(action, VoiceSecurityRejectionReason::SpeechRate);
        }
        return Err(error);
    }
    let owner = OwnerScope::from_session(&session);
    let chat = state
        .store
        .get_chat(owner, chat_id)
        .await?
        .ok_or_else(|| unavailable_voice(action))?;
    let message = chat
        .messages
        .iter()
        .find(|message| message.id == message_id)
        .ok_or_else(|| unavailable_voice(action))?;

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
    ConnectInfo(peer_addr): ConnectInfo<SocketAddr>,
    State(state): State<AppState>,
    headers: HeaderMap,
    multipart: Result<Multipart, axum::extract::multipart::MultipartRejection>,
) -> AppResult<Response> {
    let action = AuthorizationAction::TranscribeUserSpeech;
    let mut multipart = match multipart {
        Ok(multipart) => multipart,
        Err(rejection) => {
            let status = rejection.status();
            let reason = if status == StatusCode::PAYLOAD_TOO_LARGE {
                VoiceSecurityRejectionReason::AudioSizeLimit
            } else {
                VoiceSecurityRejectionReason::InvalidAudioRequest
            };
            authorization_log::voice_request_rejected(action, status, reason);
            return Ok(rejection.into_response());
        }
    };
    if !state.config.security.chat.transcription_enabled {
        return Err(AppError::NotFound);
    }
    let session = require_voice_session(&state, &headers, action).await?;
    if let Err(error) = enforce_sensitive_rate_limit(
        &state,
        &headers,
        peer_addr,
        session.id,
        RateLimitFamily::UserTranscription,
    ) {
        if matches!(error, AppError::RateLimited) {
            voice_rate_limit_rejected(action, VoiceSecurityRejectionReason::TranscriptionRate);
        }
        return Err(error);
    }
    let mut audio_bytes = None;
    let mut content_type = None;
    let mut filename = None;

    loop {
        let field = match multipart.next_field().await {
            Ok(Some(field)) => field,
            Ok(None) => break,
            Err(error) => {
                let reason = if error.status() == StatusCode::PAYLOAD_TOO_LARGE {
                    VoiceSecurityRejectionReason::AudioSizeLimit
                } else {
                    VoiceSecurityRejectionReason::InvalidAudioRequest
                };
                authorization_log::voice_request_rejected(action, StatusCode::BAD_REQUEST, reason);
                return Err(AppError::BadRequest(error.to_string()));
            }
        };
        let Some(name) = field.name().map(str::to_owned) else {
            continue;
        };

        if name != "file" && name != "audio" {
            continue;
        }

        content_type = field.content_type().map(str::to_owned);
        filename = field.file_name().map(str::to_owned);
        let bytes = match field.bytes().await {
            Ok(bytes) => bytes,
            Err(error) => {
                let reason = if error.status() == StatusCode::PAYLOAD_TOO_LARGE {
                    VoiceSecurityRejectionReason::AudioSizeLimit
                } else {
                    VoiceSecurityRejectionReason::InvalidAudioRequest
                };
                authorization_log::voice_request_rejected(action, StatusCode::BAD_REQUEST, reason);
                return Err(AppError::BadRequest(error.to_string()));
            }
        };

        if bytes.is_empty() {
            authorization_log::voice_request_rejected(
                action,
                StatusCode::BAD_REQUEST,
                VoiceSecurityRejectionReason::InvalidAudioRequest,
            );
            return Err(AppError::BadRequest(
                "speech transcription requires a non-empty audio file".to_owned(),
            ));
        }

        if bytes.len() > MAX_TRANSCRIPTION_AUDIO_BYTES {
            authorization_log::voice_request_rejected(
                action,
                StatusCode::BAD_REQUEST,
                VoiceSecurityRejectionReason::AudioSizeLimit,
            );
            return Err(AppError::BadRequest(
                "speech transcription audio is too large".to_owned(),
            ));
        }

        audio_bytes = Some(bytes.to_vec());
        break;
    }

    let audio_bytes = audio_bytes.ok_or_else(|| {
        authorization_log::voice_request_rejected(
            action,
            StatusCode::BAD_REQUEST,
            VoiceSecurityRejectionReason::InvalidAudioRequest,
        );
        AppError::BadRequest("speech transcription requires an audio file".to_owned())
    })?;
    let transcript = VoiceService::new(&state.config, &state.http)
        .transcribe_user_speech(audio_bytes, content_type.as_deref(), filename.as_deref())
        .await?;

    Ok((
        [(header::CACHE_CONTROL, HeaderValue::from_static("no-store"))],
        Json(TranscribeUserSpeechResponse {
            text: transcript.text,
        }),
    )
        .into_response())
}
