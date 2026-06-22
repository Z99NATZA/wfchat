use crate::{
    config::Config,
    error::{AppError, AppResult},
};
use reqwest::{multipart, Client};
use serde::{Deserialize, Serialize};

#[derive(Debug)]
pub struct SpeechAudio {
    pub content_type: &'static str,
    pub bytes: Vec<u8>,
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
        match self.config.ai_voice_provider.as_str() {
            "mock" => Ok(SpeechAudio {
                content_type: "audio/wav",
                bytes: generate_mock_wav(text),
            }),
            "openai" => self.synthesize_openai_speech(text).await,
            "disabled" => Err(AppError::BadRequest(
                "assistant speech playback is disabled".to_owned(),
            )),
            _ => Err(AppError::BadRequest(
                "assistant speech playback is not configured".to_owned(),
            )),
        }
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
