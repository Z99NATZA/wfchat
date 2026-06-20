use crate::{
    config::Config,
    error::{AppError, AppResult},
};

#[derive(Debug)]
pub struct SpeechAudio {
    pub content_type: &'static str,
    pub bytes: Vec<u8>,
}

pub struct VoiceService {
    provider: String,
}

impl VoiceService {
    pub fn new(config: &Config) -> Self {
        Self {
            provider: config.ai_voice_provider.clone(),
        }
    }

    pub async fn synthesize_assistant_speech(&self, text: &str) -> AppResult<SpeechAudio> {
        match self.provider.as_str() {
            "mock" => Ok(SpeechAudio {
                content_type: "audio/wav",
                bytes: generate_mock_wav(text),
            }),
            "disabled" => Err(AppError::BadRequest(
                "assistant speech playback is disabled".to_owned(),
            )),
            _ => Err(AppError::BadRequest(
                "assistant speech playback is not configured".to_owned(),
            )),
        }
    }
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

    fn config_with_voice_provider(provider: &str) -> Config {
        Config {
            app_host: "127.0.0.1".to_owned(),
            app_port: 0,
            frontend_origin: "http://localhost:5173".to_owned(),
            ai_provider: "mock".to_owned(),
            ai_model: "mock-waifu".to_owned(),
            ai_voice_provider: provider.to_owned(),
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
        let service = VoiceService::new(&config_with_voice_provider("mock"));
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
        let service = VoiceService::new(&config_with_voice_provider("disabled"));
        let error = service
            .synthesize_assistant_speech("hello")
            .await
            .expect_err("disabled speech should fail");

        assert_eq!(
            error.to_string(),
            "bad request: assistant speech playback is disabled"
        );
    }
}
