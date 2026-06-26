use crate::{
    config::Config,
    error::{AppError, AppResult},
};
use axum::body::Bytes;
use reqwest::{multipart, Client};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::pin::Pin;
use tokio_stream::Stream;

#[derive(Debug)]
pub struct SpeechAudio {
    pub content_type: &'static str,
    pub bytes: Vec<u8>,
}

pub type SpeechAudioByteStream =
    Pin<Box<dyn Stream<Item = Result<Bytes, reqwest::Error>> + Send + 'static>>;

pub enum SpeechAudioStreamBody {
    Bytes(Vec<u8>),
    Stream(SpeechAudioByteStream),
}

pub struct SpeechAudioStream {
    pub content_type: &'static str,
    pub body: SpeechAudioStreamBody,
}

#[derive(Debug, PartialEq, Eq)]
pub struct SpeechTranscript {
    pub text: String,
}

pub struct VoiceService<'a> {
    config: &'a Config,
    http: &'a Client,
}

impl<'a> VoiceService<'a> {
    pub fn new(config: &'a Config, http: &'a Client) -> Self {
        Self { config, http }
    }

    pub async fn synthesize_assistant_speech(&self, text: &str) -> AppResult<SpeechAudio> {
        self.ensure_assistant_speech_provider_enabled()?;
        let speech_text = self.derive_speech_text(text).await?;
        match self.config.ai_voice_provider.as_str() {
            "mock" => Ok(SpeechAudio {
                content_type: "audio/wav",
                bytes: generate_mock_wav(&speech_text),
            }),
            "openai" => self.synthesize_openai_speech(&speech_text).await,
            "voicevox" => self.synthesize_voicevox_speech(&speech_text).await,
            "disabled" => Err(AppError::BadRequest(
                "assistant speech playback is disabled".to_owned(),
            )),
            _ => Err(AppError::BadRequest(
                "assistant speech playback is not configured".to_owned(),
            )),
        }
    }

    pub async fn stream_assistant_speech(&self, text: &str) -> AppResult<SpeechAudioStream> {
        self.ensure_assistant_speech_provider_enabled()?;
        let speech_text = self.derive_speech_text(text).await?;
        match self.config.ai_voice_provider.as_str() {
            "mock" => Ok(SpeechAudioStream {
                content_type: "audio/wav",
                body: SpeechAudioStreamBody::Bytes(generate_mock_wav(&speech_text)),
            }),
            "openai" => self.stream_openai_speech(&speech_text).await,
            "voicevox" => {
                let audio = self.synthesize_voicevox_speech(&speech_text).await?;
                Ok(SpeechAudioStream {
                    content_type: audio.content_type,
                    body: SpeechAudioStreamBody::Bytes(audio.bytes),
                })
            }
            "disabled" => Err(AppError::BadRequest(
                "assistant speech playback is disabled".to_owned(),
            )),
            _ => Err(AppError::BadRequest(
                "assistant speech playback is not configured".to_owned(),
            )),
        }
    }

    fn ensure_assistant_speech_provider_enabled(&self) -> AppResult<()> {
        match self.config.ai_voice_provider.as_str() {
            "mock" | "openai" | "voicevox" => Ok(()),
            "disabled" => Err(AppError::BadRequest(
                "assistant speech playback is disabled".to_owned(),
            )),
            _ => Err(AppError::BadRequest(
                "assistant speech playback is not configured".to_owned(),
            )),
        }
    }

    async fn derive_speech_text(&self, text: &str) -> AppResult<String> {
        match self.config.ai_voice_speech_text_policy.as_str() {
            "original" => Ok(text.to_owned()),
            "japanese_translation" => self.translate_speech_text_to_japanese(text).await,
            other => Err(AppError::BadRequest(format!(
                "unsupported voice speech text policy: {other}"
            ))),
        }
    }

    async fn translate_speech_text_to_japanese(&self, text: &str) -> AppResult<String> {
        if self.config.ai_provider == "mock" {
            return Ok("音声用の日本語テキストです。".to_owned());
        }

        let (base_url, api_key, model) = match self.config.ai_provider.as_str() {
            "openai" => (
                self.config.openai_base_url.as_str(),
                self.config.openai_api_key.as_deref(),
                self.config.openai_model.as_str(),
            ),
            "lmstudio" => (
                self.config.lmstudio_base_url.as_str(),
                None,
                self.config.lmstudio_model.as_str(),
            ),
            "xai" => (
                self.config.xai_base_url.as_str(),
                self.config.xai_api_key.as_deref(),
                self.config.xai_model.as_str(),
            ),
            other => {
                return Err(AppError::BadRequest(format!(
                    "voice japanese_translation is not supported with AI_PROVIDER={other}"
                )))
            }
        };
        let url = format!("{}/chat/completions", base_url.trim_end_matches('/'));
        let mut request = self.http.post(url);
        if let Some(api_key) = api_key {
            request = request.bearer_auth(api_key);
        }

        let response = request
            .json(&SpeechTextTranslationRequest {
                model,
                messages: vec![
                    TranslationMessage {
                        role: "system",
                        content: JAPANESE_SPEECH_TEXT_TRANSLATION_PROMPT,
                    },
                    TranslationMessage {
                        role: "user",
                        content: text,
                    },
                ],
                temperature: 0.2,
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
            return Err(AppError::Ai(format!(
                "speech text translation provider returned {status}: {body}"
            )));
        }

        let payload: SpeechTextTranslationResponse =
            serde_json::from_str(&body).map_err(|error| AppError::Ai(error.to_string()))?;
        let translated = payload
            .choices
            .into_iter()
            .next()
            .and_then(|choice| choice.message.content)
            .map(|content| content.trim().to_owned())
            .filter(|content| !content.is_empty())
            .ok_or_else(|| {
                AppError::Ai("speech text translation provider returned empty text".to_owned())
            })?;

        Ok(translated)
    }

    pub async fn transcribe_user_speech(
        &self,
        audio_bytes: Vec<u8>,
        content_type: Option<&str>,
        filename: Option<&str>,
    ) -> AppResult<SpeechTranscript> {
        if audio_bytes.is_empty() {
            return Err(AppError::BadRequest(
                "speech transcription requires a non-empty audio file".to_owned(),
            ));
        }

        match self.config.ai_transcription_provider.as_str() {
            "mock" => Ok(SpeechTranscript {
                text: "Mock voice transcript".to_owned(),
            }),
            "openai" => {
                self.transcribe_openai_speech(audio_bytes, content_type, filename)
                    .await
            }
            "disabled" => Err(AppError::BadRequest(
                "user speech transcription is disabled".to_owned(),
            )),
            _ => Err(AppError::BadRequest(
                "user speech transcription is not configured".to_owned(),
            )),
        }
    }

    async fn synthesize_openai_speech(&self, text: &str) -> AppResult<SpeechAudio> {
        let (content_type, response) = self.send_openai_speech_request(text).await?;
        let bytes = response
            .bytes()
            .await
            .map_err(|error| AppError::Ai(error.to_string()))?
            .to_vec();

        if bytes.is_empty() {
            return Err(AppError::Ai(
                "voice provider returned empty audio".to_owned(),
            ));
        }

        Ok(SpeechAudio {
            content_type,
            bytes,
        })
    }

    async fn stream_openai_speech(&self, text: &str) -> AppResult<SpeechAudioStream> {
        let (content_type, response) = self.send_openai_speech_request(text).await?;

        Ok(SpeechAudioStream {
            content_type,
            body: SpeechAudioStreamBody::Stream(Box::pin(response.bytes_stream())),
        })
    }

    async fn synthesize_voicevox_speech(&self, text: &str) -> AppResult<SpeechAudio> {
        let audio_query = self.send_voicevox_audio_query_request(text).await?;
        validate_voicevox_audio_query(&audio_query)?;
        let bytes = self
            .send_voicevox_synthesis_request(audio_query)
            .await?
            .bytes()
            .await
            .map_err(|error| AppError::Ai(error.to_string()))?
            .to_vec();

        validate_voicevox_wav_audio(&bytes)?;

        Ok(SpeechAudio {
            content_type: "audio/wav",
            bytes,
        })
    }

    async fn send_voicevox_audio_query_request(&self, text: &str) -> AppResult<Value> {
        let url = format!(
            "{}/audio_query",
            self.config.voicevox_base_url.trim_end_matches('/')
        );
        let response = self
            .http
            .post(url)
            .query(&[
                ("text", text),
                ("speaker", self.config.voicevox_speaker_id.as_str()),
            ])
            .send()
            .await
            .map_err(|error| AppError::Ai(error.to_string()))?;

        let status = response.status();
        let body = response
            .text()
            .await
            .map_err(|error| AppError::Ai(error.to_string()))?;
        if !status.is_success() {
            return Err(AppError::Ai(format!(
                "VOICEVOX Engine audio_query returned {status}: {body}"
            )));
        }

        serde_json::from_str(&body).map_err(|error| AppError::Ai(error.to_string()))
    }

    async fn send_voicevox_synthesis_request(
        &self,
        audio_query: Value,
    ) -> AppResult<reqwest::Response> {
        let url = format!(
            "{}/synthesis",
            self.config.voicevox_base_url.trim_end_matches('/')
        );
        let response = self
            .http
            .post(url)
            .query(&[("speaker", self.config.voicevox_speaker_id.as_str())])
            .json(&audio_query)
            .send()
            .await
            .map_err(|error| AppError::Ai(error.to_string()))?;

        let status = response.status();
        if !status.is_success() {
            let body = response
                .text()
                .await
                .map_err(|error| AppError::Ai(error.to_string()))?;
            return Err(AppError::Ai(format!(
                "VOICEVOX Engine synthesis returned {status}: {body}"
            )));
        }

        Ok(response)
    }

    async fn send_openai_speech_request(
        &self,
        text: &str,
    ) -> AppResult<(&'static str, reqwest::Response)> {
        let api_key = self
            .config
            .openai_api_key
            .as_deref()
            .ok_or_else(|| AppError::Ai("OPENAI_API_KEY is not configured".to_owned()))?;
        let response_format = self.config.ai_voice_format.as_str();
        let content_type = voice_content_type(response_format)?;
        let url = format!(
            "{}/audio/speech",
            self.config.openai_base_url.trim_end_matches('/')
        );

        let response = self
            .http
            .post(url)
            .bearer_auth(api_key)
            .json(&OpenAiSpeechRequest {
                model: &self.config.ai_voice_model,
                input: text,
                voice: &self.config.ai_voice_id,
                response_format,
                instructions: self.config.ai_voice_instructions.as_deref(),
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
            return Err(AppError::Ai(format!(
                "voice provider returned {status}: {body}"
            )));
        }

        Ok((content_type, response))
    }

    async fn transcribe_openai_speech(
        &self,
        audio_bytes: Vec<u8>,
        content_type: Option<&str>,
        filename: Option<&str>,
    ) -> AppResult<SpeechTranscript> {
        let api_key = self
            .config
            .openai_api_key
            .as_deref()
            .ok_or_else(|| AppError::Ai("OPENAI_API_KEY is not configured".to_owned()))?;
        let url = format!(
            "{}/audio/transcriptions",
            self.config.openai_base_url.trim_end_matches('/')
        );
        let audio_metadata = TranscriptionAudioMetadata::new(&audio_bytes, content_type, filename);
        tracing::info!(
            filename = audio_metadata.filename,
            original_content_type = audio_metadata.original_content_type,
            normalized_content_type = audio_metadata.normalized_content_type.unwrap_or(""),
            byte_len = audio_metadata.byte_len,
            signature = audio_metadata.signature.as_str(),
            "sending user speech audio to transcription provider"
        );
        let mut file_part =
            multipart::Part::bytes(audio_bytes).file_name(audio_metadata.filename.to_owned());
        if let Some(content_type) = audio_metadata.normalized_content_type {
            file_part = file_part
                .mime_str(content_type)
                .map_err(|error| AppError::BadRequest(error.to_string()))?;
        }
        let mut form = multipart::Form::new()
            .part("file", file_part)
            .text("model", self.config.ai_transcription_model.clone())
            .text("response_format", "json");
        if let Some(prompt) = self.config.ai_transcription_prompt.as_deref() {
            form = form.text("prompt", prompt.to_owned());
        }

        let response = self
            .http
            .post(url)
            .bearer_auth(api_key)
            .multipart(form)
            .send()
            .await
            .map_err(|error| AppError::Ai(error.to_string()))?;

        let status = response.status();
        if !status.is_success() {
            let body = response
                .text()
                .await
                .map_err(|error| AppError::Ai(error.to_string()))?;
            return Err(AppError::Ai(format!(
                "transcription provider returned {status}: {body}; upload metadata: {audio_metadata}"
            )));
        }

        let payload = response
            .json::<OpenAiTranscriptionResponse>()
            .await
            .map_err(|error| AppError::Ai(error.to_string()))?;
        let text = payload.text.trim().to_owned();
        if text.is_empty() {
            return Err(AppError::Ai(
                "transcription provider returned empty text".to_owned(),
            ));
        }

        Ok(SpeechTranscript { text })
    }
}

#[derive(Serialize)]
struct OpenAiSpeechRequest<'a> {
    model: &'a str,
    input: &'a str,
    voice: &'a str,
    response_format: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    instructions: Option<&'a str>,
}

const JAPANESE_SPEECH_TEXT_TRANSLATION_PROMPT: &str = "\
Translate the user's assistant message into natural spoken Japanese for text-to-speech. \
Keep names, intent, emotional tone, and Aiko's warm companion style. \
Summarize or clean up Markdown, code blocks, URLs, and tables when needed for speech. \
Return only the Japanese speech text.";

#[derive(Serialize)]
struct SpeechTextTranslationRequest<'a> {
    model: &'a str,
    messages: Vec<TranslationMessage<'a>>,
    temperature: f32,
    stream: bool,
}

#[derive(Serialize)]
struct TranslationMessage<'a> {
    role: &'a str,
    content: &'a str,
}

#[derive(Deserialize)]
struct SpeechTextTranslationResponse {
    choices: Vec<SpeechTextTranslationChoice>,
}

#[derive(Deserialize)]
struct SpeechTextTranslationChoice {
    message: SpeechTextTranslationMessage,
}

#[derive(Deserialize)]
struct SpeechTextTranslationMessage {
    content: Option<String>,
}

#[derive(Deserialize)]
struct OpenAiTranscriptionResponse {
    text: String,
}

#[derive(Debug)]
struct TranscriptionAudioMetadata<'a> {
    byte_len: usize,
    filename: &'a str,
    original_content_type: &'a str,
    normalized_content_type: Option<&'static str>,
    signature: String,
}

impl<'a> TranscriptionAudioMetadata<'a> {
    fn new(bytes: &[u8], content_type: Option<&'a str>, filename: Option<&'a str>) -> Self {
        Self {
            byte_len: bytes.len(),
            filename: filename.unwrap_or("speech.webm"),
            original_content_type: content_type.unwrap_or(""),
            normalized_content_type: content_type.and_then(normalize_transcription_content_type),
            signature: audio_signature(bytes),
        }
    }
}

impl std::fmt::Display for TranscriptionAudioMetadata<'_> {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            formatter,
            "filename={}, content_type={}, normalized_content_type={}, bytes={}, signature={}",
            self.filename,
            self.original_content_type,
            self.normalized_content_type.unwrap_or(""),
            self.byte_len,
            self.signature
        )
    }
}

fn voice_content_type(format: &str) -> AppResult<&'static str> {
    match format {
        "mp3" => Ok("audio/mpeg"),
        "wav" => Ok("audio/wav"),
        other => Err(AppError::BadRequest(format!(
            "unsupported voice audio format: {other}"
        ))),
    }
}

fn normalize_transcription_content_type(content_type: &str) -> Option<&'static str> {
    match content_type
        .split(';')
        .next()
        .map(str::trim)
        .unwrap_or_default()
        .to_ascii_lowercase()
        .as_str()
    {
        "audio/webm" => Some("audio/webm"),
        "audio/wav" | "audio/x-wav" => Some("audio/wav"),
        "audio/mpeg" | "audio/mp3" => Some("audio/mpeg"),
        "audio/mp4" | "audio/x-m4a" => Some("audio/mp4"),
        "audio/ogg" => Some("audio/ogg"),
        "audio/flac" => Some("audio/flac"),
        _ => None,
    }
}

fn audio_signature(bytes: &[u8]) -> String {
    bytes
        .iter()
        .take(12)
        .map(|byte| format!("{byte:02x}"))
        .collect::<Vec<_>>()
        .join("")
}

fn validate_voicevox_audio_query(audio_query: &Value) -> AppResult<()> {
    if voicevox_audio_query_has_speakable_mora(audio_query) {
        return Ok(());
    }

    Err(AppError::Ai(
        "VOICEVOX Engine did not return speakable phonemes for speech text; use AI_VOICE_SPEECH_TEXT_POLICY=japanese_translation for non-Japanese replies".to_owned(),
    ))
}

fn voicevox_audio_query_has_speakable_mora(audio_query: &Value) -> bool {
    audio_query
        .get("accent_phrases")
        .and_then(Value::as_array)
        .map(|accent_phrases| {
            accent_phrases.iter().any(|accent_phrase| {
                accent_phrase
                    .get("moras")
                    .and_then(Value::as_array)
                    .map(|moras| moras.iter().any(voicevox_mora_has_sound))
                    .unwrap_or(false)
            })
        })
        .unwrap_or(false)
}

fn voicevox_mora_has_sound(mora: &Value) -> bool {
    ["text", "consonant", "vowel"].iter().any(|field| {
        mora.get(field)
            .and_then(Value::as_str)
            .map(|value| !value.trim().is_empty())
            .unwrap_or(false)
    })
}

fn validate_voicevox_wav_audio(bytes: &[u8]) -> AppResult<()> {
    if bytes.is_empty() {
        return Err(AppError::Ai(
            "VOICEVOX Engine returned empty audio".to_owned(),
        ));
    }

    if !bytes.starts_with(b"RIFF") || bytes.get(8..12) != Some(b"WAVE".as_slice()) {
        return Err(AppError::Ai(
            "VOICEVOX Engine returned invalid WAV audio".to_owned(),
        ));
    }

    let data = wav_data_chunk(bytes).ok_or_else(|| {
        AppError::Ai("VOICEVOX Engine returned WAV audio without a data chunk".to_owned())
    })?;
    if data.is_empty() {
        return Err(AppError::Ai(
            "VOICEVOX Engine returned WAV audio without samples".to_owned(),
        ));
    }

    if data.iter().all(|byte| *byte == 0) {
        return Err(AppError::Ai(
            "VOICEVOX Engine returned silent WAV audio".to_owned(),
        ));
    }

    Ok(())
}

fn wav_data_chunk(bytes: &[u8]) -> Option<&[u8]> {
    if bytes.len() < 12 {
        return None;
    }

    let mut index = 12usize;
    while index.checked_add(8)? <= bytes.len() {
        let chunk_id = bytes.get(index..index + 4)?;
        let size_bytes = bytes.get(index + 4..index + 8)?;
        let chunk_size =
            u32::from_le_bytes([size_bytes[0], size_bytes[1], size_bytes[2], size_bytes[3]])
                as usize;
        let data_start = index + 8;
        let data_end = data_start.checked_add(chunk_size)?;
        if data_end > bytes.len() {
            return None;
        }
        if chunk_id == b"data" {
            return bytes.get(data_start..data_end);
        }
        index = data_end + (chunk_size % 2);
    }

    None
}

fn generate_mock_wav(text: &str) -> Vec<u8> {
    const SAMPLE_RATE: u32 = 8_000;
    const CHANNELS: u16 = 1;
    const BITS_PER_SAMPLE: u16 = 16;
    const BYTES_PER_SAMPLE: u16 = BITS_PER_SAMPLE / 8;
    const DURATION_MS: u32 = 420;

    let sample_count = SAMPLE_RATE * DURATION_MS / 1_000;
    let data_size = sample_count * u32::from(CHANNELS) * u32::from(BYTES_PER_SAMPLE);
    let byte_rate = SAMPLE_RATE * u32::from(CHANNELS) * u32::from(BYTES_PER_SAMPLE);
    let block_align = CHANNELS * BYTES_PER_SAMPLE;
    let frequency_hz = 420.0 + (stable_text_hash(text) % 220) as f32;
    let amplitude = i16::MAX as f32 * 0.18;
    let mut bytes = Vec::with_capacity(44 + data_size as usize);

    bytes.extend_from_slice(b"RIFF");
    bytes.extend_from_slice(&(36 + data_size).to_le_bytes());
    bytes.extend_from_slice(b"WAVE");
    bytes.extend_from_slice(b"fmt ");
    bytes.extend_from_slice(&16u32.to_le_bytes());
    bytes.extend_from_slice(&1u16.to_le_bytes());
    bytes.extend_from_slice(&CHANNELS.to_le_bytes());
    bytes.extend_from_slice(&SAMPLE_RATE.to_le_bytes());
    bytes.extend_from_slice(&byte_rate.to_le_bytes());
    bytes.extend_from_slice(&block_align.to_le_bytes());
    bytes.extend_from_slice(&BITS_PER_SAMPLE.to_le_bytes());
    bytes.extend_from_slice(b"data");
    bytes.extend_from_slice(&data_size.to_le_bytes());

    for index in 0..sample_count {
        let position = index as f32 / SAMPLE_RATE as f32;
        let fade_in = (index as f32 / 400.0).min(1.0);
        let fade_out = ((sample_count - index) as f32 / 800.0).min(1.0);
        let envelope = fade_in.min(fade_out);
        let sample = (position * frequency_hz * std::f32::consts::TAU).sin() * amplitude * envelope;
        bytes.extend_from_slice(&(sample as i16).to_le_bytes());
    }

    bytes
}

fn stable_text_hash(text: &str) -> u32 {
    text.bytes().fold(2_166_136_261u32, |hash, byte| {
        hash.wrapping_mul(16_777_619) ^ u32::from(byte)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;
    use std::{
        io::{Read, Write},
        net::TcpListener,
        thread,
    };

    fn config_with_voice_provider(provider: &str) -> Config {
        Config {
            app_host: "127.0.0.1".to_owned(),
            app_port: 0,
            frontend_origin: "http://localhost:5173".to_owned(),
            ai_provider: "mock".to_owned(),
            ai_model: "mock-waifu".to_owned(),
            ai_voice_provider: provider.to_owned(),
            ai_voice_model: "gpt-4o-mini-tts".to_owned(),
            ai_voice_id: "marin".to_owned(),
            ai_voice_format: "mp3".to_owned(),
            ai_voice_instructions: None,
            ai_voice_speech_text_policy: "original".to_owned(),
            ai_transcription_provider: provider.to_owned(),
            ai_transcription_model: "gpt-4o-mini-transcribe".to_owned(),
            ai_transcription_prompt: None,
            database_url: "postgres://postgres:postgres@localhost:5432/wfchat".to_owned(),
            openai_api_key: None,
            openai_base_url: "https://api.openai.com/v1".to_owned(),
            openai_model: "gpt-4.1-mini".to_owned(),
            lmstudio_base_url: "http://localhost:1234/v1".to_owned(),
            lmstudio_model: "local-model".to_owned(),
            xai_api_key: None,
            xai_base_url: "https://api.x.ai/v1".to_owned(),
            xai_model: "grok-3-mini".to_owned(),
            voicevox_base_url: "http://localhost:50021".to_owned(),
            voicevox_speaker_id: "".to_owned(),
            voicevox_credit: None,
            google_client_id: None,
        }
    }

    #[tokio::test]
    async fn mock_provider_returns_wav_audio() {
        let http = Client::new();
        let config = config_with_voice_provider("mock");
        let service = VoiceService::new(&config, &http);
        let audio = service
            .synthesize_assistant_speech("hello")
            .await
            .expect("mock audio should synthesize");

        assert_eq!(audio.content_type, "audio/wav");
        assert!(audio.bytes.starts_with(b"RIFF"));
        assert_eq!(&audio.bytes[8..12], b"WAVE");
    }

    #[tokio::test]
    async fn disabled_provider_rejects_speech() {
        let http = Client::new();
        let config = config_with_voice_provider("disabled");
        let service = VoiceService::new(&config, &http);
        let error = service
            .synthesize_assistant_speech("hello")
            .await
            .expect_err("disabled speech should fail");

        assert_eq!(
            error.to_string(),
            "bad request: assistant speech playback is disabled"
        );
    }

    #[tokio::test]
    async fn mock_japanese_translation_policy_derives_separate_speech_text() {
        let http = Client::new();
        let mut config = config_with_voice_provider("mock");
        config.ai_voice_speech_text_policy = "japanese_translation".to_owned();
        let service = VoiceService::new(&config, &http);

        let speech_text = service
            .derive_speech_text("hello in the displayed chat language")
            .await
            .expect("mock speech text translation should succeed");

        assert_eq!(speech_text, "音声用の日本語テキストです。");
    }

    #[tokio::test]
    async fn mock_provider_returns_text_transcript() {
        let http = Client::new();
        let config = config_with_voice_provider("mock");
        let service = VoiceService::new(&config, &http);
        let transcript = service
            .transcribe_user_speech(
                b"fake-audio".to_vec(),
                Some("audio/webm"),
                Some("voice.webm"),
            )
            .await
            .expect("mock transcription should succeed");

        assert_eq!(transcript.text, "Mock voice transcript");
    }

    #[tokio::test]
    async fn disabled_provider_rejects_transcription() {
        let http = Client::new();
        let config = config_with_voice_provider("disabled");
        let service = VoiceService::new(&config, &http);
        let error = service
            .transcribe_user_speech(
                b"fake-audio".to_vec(),
                Some("audio/webm"),
                Some("voice.webm"),
            )
            .await
            .expect_err("disabled transcription should fail");

        assert_eq!(
            error.to_string(),
            "bad request: user speech transcription is disabled"
        );
    }

    #[tokio::test]
    async fn openai_provider_posts_speech_request_and_returns_audio() {
        let (base_url, request_handle) =
            one_response_server("HTTP/1.1 200 OK", "Content-Type: audio/mpeg", b"FAKEAUDIO");
        let http = Client::new();
        let mut config = config_with_voice_provider("openai");
        config.openai_api_key = Some("test-key".to_owned());
        config.openai_base_url = base_url;
        config.ai_voice_model = "gpt-4o-mini-tts".to_owned();
        config.ai_voice_id = "marin".to_owned();
        config.ai_voice_format = "mp3".to_owned();
        config.ai_voice_instructions = Some("Speak warmly.".to_owned());
        let service = VoiceService::new(&config, &http);

        let audio = service
            .synthesize_assistant_speech("hello from Aiko")
            .await
            .expect("openai speech should synthesize");
        let captured = request_handle
            .join()
            .expect("mock provider server should capture request");
        let body: Value =
            serde_json::from_slice(&captured.body).expect("request body should be json");

        assert_eq!(audio.content_type, "audio/mpeg");
        assert_eq!(audio.bytes, b"FAKEAUDIO");
        assert!(captured.head.starts_with("post /audio/speech http/1.1"));
        assert!(captured.head.contains("authorization: bearer test-key"));
        assert_eq!(body["model"], "gpt-4o-mini-tts");
        assert_eq!(body["input"], "hello from Aiko");
        assert_eq!(body["voice"], "marin");
        assert_eq!(body["response_format"], "mp3");
        assert_eq!(body["instructions"], "Speak warmly.");
    }

    #[tokio::test]
    async fn openai_provider_maps_wav_content_type() {
        let (base_url, request_handle) =
            one_response_server("HTTP/1.1 200 OK", "Content-Type: audio/wav", b"RIFFDATA");
        let http = Client::new();
        let mut config = config_with_voice_provider("openai");
        config.openai_api_key = Some("test-key".to_owned());
        config.openai_base_url = base_url;
        config.ai_voice_format = "wav".to_owned();
        let service = VoiceService::new(&config, &http);

        let audio = service
            .synthesize_assistant_speech("hello")
            .await
            .expect("openai wav speech should synthesize");
        request_handle
            .join()
            .expect("mock provider server should capture request");

        assert_eq!(audio.content_type, "audio/wav");
        assert_eq!(audio.bytes, b"RIFFDATA");
    }

    #[tokio::test]
    async fn openai_provider_returns_provider_errors() {
        let (base_url, request_handle) = one_response_server(
            "HTTP/1.1 429 Too Many Requests",
            "Content-Type: application/json",
            br#"{"error":{"message":"rate limited"}}"#,
        );
        let http = Client::new();
        let mut config = config_with_voice_provider("openai");
        config.openai_api_key = Some("test-key".to_owned());
        config.openai_base_url = base_url;
        let service = VoiceService::new(&config, &http);

        let error = service
            .synthesize_assistant_speech("hello")
            .await
            .expect_err("provider error should fail");
        request_handle
            .join()
            .expect("mock provider server should capture request");

        assert!(error
            .to_string()
            .contains("voice provider returned 429 Too Many Requests"));
        assert!(error.to_string().contains("rate limited"));
    }

    #[tokio::test]
    async fn japanese_translation_policy_calls_configured_chat_provider() {
        let (base_url, request_handle) = one_response_server(
            "HTTP/1.1 200 OK",
            "Content-Type: application/json",
            br#"{"choices":[{"message":{"content":" \u3053\u3093\u306b\u3061\u306f\u3001\u30a2\u30a4\u30b3\u3067\u3059\u3002 "}}]}"#,
        );
        let http = Client::new();
        let mut config = config_with_voice_provider("mock");
        config.ai_voice_speech_text_policy = "japanese_translation".to_owned();
        config.ai_provider = "openai".to_owned();
        config.openai_api_key = Some("test-key".to_owned());
        config.openai_base_url = base_url;
        config.openai_model = "gpt-4.1-mini".to_owned();
        let service = VoiceService::new(&config, &http);

        let speech_text = service
            .derive_speech_text("Hello, this stays displayed in English.")
            .await
            .expect("speech text translation should succeed");
        let captured = request_handle
            .join()
            .expect("mock provider server should capture request");
        let body: Value =
            serde_json::from_slice(&captured.body).expect("request body should be json");

        assert_eq!(speech_text, "こんにちは、アイコです。");
        assert!(captured.head.starts_with("post /chat/completions http/1.1"));
        assert!(captured.head.contains("authorization: bearer test-key"));
        assert_eq!(body["model"], "gpt-4.1-mini");
        assert_eq!(body["stream"], false);
        assert_eq!(body["messages"][1]["role"], "user");
        assert_eq!(
            body["messages"][1]["content"],
            "Hello, this stays displayed in English."
        );
    }

    #[tokio::test]
    async fn voicevox_provider_calls_audio_query_then_synthesis_and_returns_wav() {
        let wav = generate_mock_wav("voicevox");
        let (base_url, request_handle) =
            voicevox_response_server_with(VOICEVOX_AUDIO_QUERY_WITH_MORA, wav.clone());
        let http = Client::new();
        let mut config = config_with_voice_provider("voicevox");
        config.voicevox_base_url = base_url;
        config.voicevox_speaker_id = "3".to_owned();
        let service = VoiceService::new(&config, &http);

        let audio = service
            .synthesize_assistant_speech("hello")
            .await
            .expect("voicevox speech should synthesize");
        let captured = request_handle
            .join()
            .expect("mock voicevox server should capture requests");
        let synthesis_body: Value =
            serde_json::from_slice(&captured[1].body).expect("synthesis body should be json");

        assert_eq!(audio.content_type, "audio/wav");
        assert_eq!(audio.bytes, wav);
        assert!(captured[0]
            .head
            .starts_with("post /audio_query?text=hello&speaker=3 http/1.1"));
        assert!(captured[1]
            .head
            .starts_with("post /synthesis?speaker=3 http/1.1"));
        assert_eq!(
            synthesis_body["accent_phrases"][0]["moras"][0]["text"],
            "コ"
        );
    }

    #[tokio::test]
    async fn voicevox_provider_rejects_audio_query_without_speakable_moras() {
        let (base_url, request_handle) = one_response_server(
            "HTTP/1.1 200 OK",
            "Content-Type: application/json",
            br#"{"accent_phrases":[]}"#,
        );
        let http = Client::new();
        let mut config = config_with_voice_provider("voicevox");
        config.voicevox_base_url = base_url;
        config.voicevox_speaker_id = "3".to_owned();
        let service = VoiceService::new(&config, &http);

        let error = service
            .synthesize_assistant_speech("hello")
            .await
            .expect_err("voicevox audio query without moras should fail");
        let captured = request_handle
            .join()
            .expect("mock voicevox server should capture request");

        assert!(captured
            .head
            .starts_with("post /audio_query?text=hello&speaker=3 http/1.1"));
        assert!(error
            .to_string()
            .contains("VOICEVOX Engine did not return speakable phonemes"));
        assert!(error
            .to_string()
            .contains("AI_VOICE_SPEECH_TEXT_POLICY=japanese_translation"));
    }

    #[tokio::test]
    async fn voicevox_provider_rejects_silent_wav_audio() {
        let (base_url, request_handle) =
            voicevox_response_server_with(VOICEVOX_AUDIO_QUERY_WITH_MORA, generate_silent_wav());
        let http = Client::new();
        let mut config = config_with_voice_provider("voicevox");
        config.voicevox_base_url = base_url;
        config.voicevox_speaker_id = "3".to_owned();
        let service = VoiceService::new(&config, &http);

        let error = service
            .synthesize_assistant_speech("hello")
            .await
            .expect_err("voicevox silent wav should fail");
        let captured = request_handle
            .join()
            .expect("mock voicevox server should capture requests");

        assert_eq!(captured.len(), 2);
        assert!(error
            .to_string()
            .contains("VOICEVOX Engine returned silent WAV audio"));
    }

    #[test]
    fn transcription_content_type_strips_media_recorder_codec_parameter() {
        assert_eq!(
            normalize_transcription_content_type("audio/webm;codecs=opus"),
            Some("audio/webm")
        );
        assert_eq!(
            normalize_transcription_content_type("audio/x-wav"),
            Some("audio/wav")
        );
        assert_eq!(normalize_transcription_content_type("video/webm"), None);
    }

    #[tokio::test]
    async fn openai_provider_posts_transcription_request_and_returns_text() {
        let (base_url, request_handle) = one_response_server(
            "HTTP/1.1 200 OK",
            "Content-Type: application/json",
            br#"{"text":" hello from mic "}"#,
        );
        let http = Client::new();
        let mut config = config_with_voice_provider("openai");
        config.openai_api_key = Some("test-key".to_owned());
        config.openai_base_url = base_url;
        config.ai_transcription_model = "gpt-4o-mini-transcribe".to_owned();
        config.ai_transcription_prompt = Some("Keep names exact.".to_owned());
        let service = VoiceService::new(&config, &http);

        let transcript = service
            .transcribe_user_speech(
                b"fake-audio".to_vec(),
                Some("audio/webm;codecs=opus"),
                Some("voice.webm"),
            )
            .await
            .expect("openai transcription should return text");
        let captured = request_handle
            .join()
            .expect("mock provider server should capture request");
        let body = String::from_utf8_lossy(&captured.body);

        assert_eq!(transcript.text, "hello from mic");
        assert!(captured
            .head
            .starts_with("post /audio/transcriptions http/1.1"));
        assert!(captured.head.contains("authorization: bearer test-key"));
        assert!(body.contains("name=\"model\""));
        assert!(body.contains("gpt-4o-mini-transcribe"));
        assert!(body.contains("name=\"response_format\""));
        assert!(body.contains("json"));
        assert!(body.contains("name=\"prompt\""));
        assert!(body.contains("Keep names exact."));
        assert!(body.contains("name=\"file\"; filename=\"voice.webm\""));
        assert!(body.contains("Content-Type: audio/webm"));
        assert!(!body.contains("codecs=opus"));
        assert!(body.contains("fake-audio"));
    }

    #[tokio::test]
    async fn openai_provider_returns_transcription_errors() {
        let (base_url, request_handle) = one_response_server(
            "HTTP/1.1 500 Internal Server Error",
            "Content-Type: application/json",
            br#"{"error":{"message":"transcription failed"}}"#,
        );
        let http = Client::new();
        let mut config = config_with_voice_provider("openai");
        config.openai_api_key = Some("test-key".to_owned());
        config.openai_base_url = base_url;
        let service = VoiceService::new(&config, &http);

        let error = service
            .transcribe_user_speech(
                b"fake-audio".to_vec(),
                Some("audio/webm"),
                Some("voice.webm"),
            )
            .await
            .expect_err("provider error should fail");
        request_handle
            .join()
            .expect("mock provider server should capture request");

        assert!(error
            .to_string()
            .contains("transcription provider returned 500 Internal Server Error"));
        assert!(error.to_string().contains("transcription failed"));
    }

    struct CapturedRequest {
        head: String,
        body: Vec<u8>,
    }

    fn one_response_server(
        status_line: &'static str,
        content_type_header: &'static str,
        response_body: &'static [u8],
    ) -> (String, thread::JoinHandle<CapturedRequest>) {
        let listener = TcpListener::bind("127.0.0.1:0").expect("mock server should bind");
        let addr = listener
            .local_addr()
            .expect("mock server addr should exist");
        let handle = thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("mock server should accept");
            let mut request_bytes = Vec::new();
            let mut buffer = [0u8; 4096];

            loop {
                let read = stream.read(&mut buffer).expect("request should read");
                if read == 0 {
                    break;
                }
                request_bytes.extend_from_slice(&buffer[..read]);
                if let Some(header_end) = find_header_end(&request_bytes) {
                    let head = String::from_utf8_lossy(&request_bytes[..header_end]).to_string();
                    let content_length = read_content_length(&head);
                    let body_start = header_end + 4;
                    let expected_len = body_start + content_length;
                    while request_bytes.len() < expected_len {
                        let read = stream.read(&mut buffer).expect("body should read");
                        if read == 0 {
                            break;
                        }
                        request_bytes.extend_from_slice(&buffer[..read]);
                    }
                    let body = request_bytes[body_start..expected_len].to_vec();
                    let response = format!(
                        "{status_line}\r\n{content_type_header}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                        response_body.len()
                    );
                    stream
                        .write_all(response.as_bytes())
                        .expect("response headers should write");
                    stream
                        .write_all(response_body)
                        .expect("response body should write");
                    return CapturedRequest {
                        head: head.to_ascii_lowercase(),
                        body,
                    };
                }
            }

            panic!("mock server did not receive a complete request");
        });

        (format!("http://{addr}"), handle)
    }

    const VOICEVOX_AUDIO_QUERY_WITH_MORA: &[u8] =
        br#"{"accent_phrases":[{"moras":[{"text":"\u30b3","consonant":"k","vowel":"o"}]}]}"#;

    fn voicevox_response_server_with(
        audio_query_body: &'static [u8],
        synthesis_body: Vec<u8>,
    ) -> (String, thread::JoinHandle<Vec<CapturedRequest>>) {
        let listener = TcpListener::bind("127.0.0.1:0").expect("mock server should bind");
        let addr = listener
            .local_addr()
            .expect("mock server addr should exist");
        let handle = thread::spawn(move || {
            let responses: [(&str, Vec<u8>); 2] = [
                ("Content-Type: application/json", audio_query_body.to_vec()),
                ("Content-Type: audio/wav", synthesis_body),
            ];
            let mut captured = Vec::new();

            for (content_type_header, response_body) in responses {
                let (mut stream, _) = listener.accept().expect("mock server should accept");
                let request = read_captured_request(&mut stream);
                let response = format!(
                    "HTTP/1.1 200 OK\r\n{content_type_header}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                    response_body.len()
                );
                stream
                    .write_all(response.as_bytes())
                    .expect("response headers should write");
                stream
                    .write_all(&response_body)
                    .expect("response body should write");
                captured.push(request);
            }

            captured
        });

        (format!("http://{addr}"), handle)
    }

    fn generate_silent_wav() -> Vec<u8> {
        let mut wav = generate_mock_wav("silent");
        if let Some(data_start) = wav
            .windows(4)
            .position(|window| window == b"data")
            .map(|index| index + 8)
        {
            for byte in &mut wav[data_start..] {
                *byte = 0;
            }
        }

        wav
    }

    fn read_captured_request(stream: &mut std::net::TcpStream) -> CapturedRequest {
        let mut request_bytes = Vec::new();
        let mut buffer = [0u8; 4096];

        loop {
            let read = stream.read(&mut buffer).expect("request should read");
            if read == 0 {
                break;
            }
            request_bytes.extend_from_slice(&buffer[..read]);
            if let Some(header_end) = find_header_end(&request_bytes) {
                let head = String::from_utf8_lossy(&request_bytes[..header_end]).to_string();
                let content_length = read_content_length(&head);
                let body_start = header_end + 4;
                let expected_len = body_start + content_length;
                while request_bytes.len() < expected_len {
                    let read = stream.read(&mut buffer).expect("body should read");
                    if read == 0 {
                        break;
                    }
                    request_bytes.extend_from_slice(&buffer[..read]);
                }
                let body = request_bytes[body_start..expected_len].to_vec();
                return CapturedRequest {
                    head: head.to_ascii_lowercase(),
                    body,
                };
            }
        }

        panic!("mock server did not receive a complete request");
    }

    fn find_header_end(request_bytes: &[u8]) -> Option<usize> {
        request_bytes
            .windows(4)
            .position(|window| window == b"\r\n\r\n")
    }

    fn read_content_length(head: &str) -> usize {
        head.lines()
            .find_map(|line| {
                let (name, value) = line.split_once(':')?;
                name.eq_ignore_ascii_case("content-length")
                    .then(|| value.trim().parse::<usize>().ok())
                    .flatten()
            })
            .unwrap_or(0)
    }
}
