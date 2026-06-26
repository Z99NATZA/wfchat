use std::{env, net::SocketAddr};

#[derive(Clone, Debug)]
pub struct Config {
    pub app_host: String,
    pub app_port: u16,
    pub frontend_origin: String,
    pub ai_provider: String,
    pub ai_model: String,
    pub ai_voice_provider: String,
    pub ai_voice_model: String,
    pub ai_voice_id: String,
    pub ai_voice_format: String,
    pub ai_voice_instructions: Option<String>,
    pub ai_voice_speech_text_policy: String,
    pub ai_transcription_provider: String,
    pub ai_transcription_model: String,
    pub ai_transcription_prompt: Option<String>,
    pub database_url: String,
    pub openai_api_key: Option<String>,
    pub openai_base_url: String,
    pub openai_model: String,
    pub lmstudio_base_url: String,
    pub lmstudio_model: String,
    pub xai_api_key: Option<String>,
    pub xai_base_url: String,
    pub xai_model: String,
    pub voicevox_base_url: String,
    pub voicevox_speaker_id: String,
    pub voicevox_credit: Option<String>,
    pub google_client_id: Option<String>,
}

impl Config {
    pub fn from_env() -> Result<Self, String> {
        let config = Self {
            app_host: env_value("APP_HOST", "0.0.0.0"),
            app_port: env_value("APP_PORT", "8080").parse().unwrap_or(8080),
            frontend_origin: env_value(
                "FRONTEND_ORIGINS",
                &env_value("FRONTEND_ORIGIN", "http://localhost:5173"),
            ),
            ai_provider: env_value("AI_PROVIDER", "mock"),
            ai_model: env_value("AI_MODEL", "mock-waifu"),
            ai_voice_provider: env_value("AI_VOICE_PROVIDER", "disabled"),
            ai_voice_model: env_value("AI_VOICE_MODEL", "gpt-4o-mini-tts"),
            ai_voice_id: env_value("AI_VOICE_ID", "marin"),
            ai_voice_format: env_value("AI_VOICE_FORMAT", "mp3"),
            ai_voice_instructions: optional_env_value("AI_VOICE_INSTRUCTIONS"),
            ai_voice_speech_text_policy: env_value("AI_VOICE_SPEECH_TEXT_POLICY", "original"),
            ai_transcription_provider: env_value("AI_TRANSCRIPTION_PROVIDER", "disabled"),
            ai_transcription_model: env_value("AI_TRANSCRIPTION_MODEL", "gpt-4o-mini-transcribe"),
            ai_transcription_prompt: optional_env_value("AI_TRANSCRIPTION_PROMPT"),
            database_url: env_value(
                "DATABASE_URL",
                "postgres://postgres:postgres@localhost:5432/wfchat",
            ),
            openai_api_key: optional_env_value("OPENAI_API_KEY"),
            openai_base_url: env_value("OPENAI_BASE_URL", "https://api.openai.com/v1"),
            openai_model: env_value("OPENAI_MODEL", "gpt-4.1-mini"),
            lmstudio_base_url: env_value("LMSTUDIO_BASE_URL", "http://localhost:1234/v1"),
            lmstudio_model: env_value("LMSTUDIO_MODEL", "local-model"),
            xai_api_key: optional_env_value("XAI_API_KEY"),
            xai_base_url: env_value("XAI_BASE_URL", "https://api.x.ai/v1"),
            xai_model: env_value("XAI_MODEL", "grok-3-mini"),
            voicevox_base_url: env_value("VOICEVOX_BASE_URL", "http://localhost:50021"),
            voicevox_speaker_id: env_value("VOICEVOX_SPEAKER_ID", ""),
            voicevox_credit: optional_env_value("VOICEVOX_CREDIT"),
            google_client_id: optional_env_value("GOOGLE_CLIENT_ID"),
        };

        config.validate()?;
        Ok(config)
    }

    pub fn bind_addr(&self) -> Result<SocketAddr, std::net::AddrParseError> {
        format!("{}:{}", self.app_host, self.app_port).parse()
    }

    pub fn active_model(&self) -> &str {
        match self.ai_provider.as_str() {
            "openai" => &self.openai_model,
            "lmstudio" => &self.lmstudio_model,
            "xai" => &self.xai_model,
            _ => &self.ai_model,
        }
    }

    fn validate(&self) -> Result<(), String> {
        match self.ai_provider.as_str() {
            "mock" => Ok(()),
            "openai" => {
                require_non_empty(
                    self.openai_api_key.as_deref(),
                    "OPENAI_API_KEY is required when AI_PROVIDER=openai",
                )?;
                require_non_empty(
                    Some(self.openai_model.as_str()),
                    "OPENAI_MODEL is required when AI_PROVIDER=openai",
                )
            }
            "xai" => {
                require_non_empty(
                    self.xai_api_key.as_deref(),
                    "XAI_API_KEY is required when AI_PROVIDER=xai",
                )?;
                require_non_empty(
                    Some(self.xai_model.as_str()),
                    "XAI_MODEL is required when AI_PROVIDER=xai",
                )
            }
            "lmstudio" => require_non_empty(
                Some(self.lmstudio_model.as_str()),
                "LMSTUDIO_MODEL is required when AI_PROVIDER=lmstudio",
            ),
            "anthropic" | "claude" => Err(
                "AI_PROVIDER=anthropic is configured but not implemented yet in this project"
                    .to_owned(),
            ),
            other => Err(format!(
                "AI_PROVIDER={other} is invalid. Allowed values: mock, openai, xai, lmstudio"
            )),
        }?;
        validate_voice_speech_text_policy(&self.ai_voice_speech_text_policy)?;
        match self.ai_voice_provider.as_str() {
            "disabled" | "mock" => Ok(()),
            "openai" => {
                require_non_empty(
                    self.openai_api_key.as_deref(),
                    "OPENAI_API_KEY is required when AI_VOICE_PROVIDER=openai",
                )?;
                require_non_empty(
                    Some(self.ai_voice_model.as_str()),
                    "AI_VOICE_MODEL is required when AI_VOICE_PROVIDER=openai",
                )?;
                require_non_empty(
                    Some(self.ai_voice_id.as_str()),
                    "AI_VOICE_ID is required when AI_VOICE_PROVIDER=openai",
                )?;
                validate_voice_format(&self.ai_voice_format)
            }
            "voicevox" => {
                require_non_empty(
                    Some(self.voicevox_base_url.as_str()),
                    "VOICEVOX_BASE_URL is required when AI_VOICE_PROVIDER=voicevox",
                )?;
                require_non_empty(
                    Some(self.voicevox_speaker_id.as_str()),
                    "VOICEVOX_SPEAKER_ID is required when AI_VOICE_PROVIDER=voicevox",
                )
            }
            other => Err(format!(
                "AI_VOICE_PROVIDER={other} is invalid. Allowed values: disabled, mock, openai, voicevox"
            )),
        }?;
        match self.ai_transcription_provider.as_str() {
            "disabled" | "mock" => Ok(()),
            "openai" => {
                require_non_empty(
                    self.openai_api_key.as_deref(),
                    "OPENAI_API_KEY is required when AI_TRANSCRIPTION_PROVIDER=openai",
                )?;
                require_non_empty(
                    Some(self.ai_transcription_model.as_str()),
                    "AI_TRANSCRIPTION_MODEL is required when AI_TRANSCRIPTION_PROVIDER=openai",
                )
            }
            other => Err(format!(
                "AI_TRANSCRIPTION_PROVIDER={other} is invalid. Allowed values: disabled, mock, openai"
            )),
        }
    }
}

fn env_value(key: &str, fallback: &str) -> String {
    env::var(key).unwrap_or_else(|_| fallback.to_owned())
}

fn optional_env_value(key: &str) -> Option<String> {
    env::var(key).ok().filter(|value| !value.trim().is_empty())
}

fn require_non_empty(value: Option<&str>, message: &str) -> Result<(), String> {
    if value.map(|v| !v.trim().is_empty()).unwrap_or(false) {
        Ok(())
    } else {
        Err(message.to_owned())
    }
}

fn validate_voice_format(format: &str) -> Result<(), String> {
    match format {
        "mp3" | "wav" => Ok(()),
        other => Err(format!(
            "AI_VOICE_FORMAT={other} is invalid. Allowed values: mp3, wav"
        )),
    }
}

fn validate_voice_speech_text_policy(policy: &str) -> Result<(), String> {
    match policy {
        "original" | "japanese_translation" => Ok(()),
        other => Err(format!(
            "AI_VOICE_SPEECH_TEXT_POLICY={other} is invalid. Allowed values: original, japanese_translation"
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::Config;

    fn base_config() -> Config {
        Config {
            app_host: "0.0.0.0".to_owned(),
            app_port: 8080,
            frontend_origin: "http://localhost:5173".to_owned(),
            ai_provider: "mock".to_owned(),
            ai_model: "mock-waifu".to_owned(),
            ai_voice_provider: "disabled".to_owned(),
            ai_voice_model: "gpt-4o-mini-tts".to_owned(),
            ai_voice_id: "marin".to_owned(),
            ai_voice_format: "mp3".to_owned(),
            ai_voice_instructions: None,
            ai_voice_speech_text_policy: "original".to_owned(),
            ai_transcription_provider: "disabled".to_owned(),
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

    #[test]
    fn openai_requires_api_key() {
        let mut config = base_config();
        config.ai_provider = "openai".to_owned();

        let error = config
            .validate()
            .expect_err("openai should require api key");
        assert_eq!(error, "OPENAI_API_KEY is required when AI_PROVIDER=openai");
    }

    #[test]
    fn xai_requires_api_key() {
        let mut config = base_config();
        config.ai_provider = "xai".to_owned();

        let error = config.validate().expect_err("xai should require api key");
        assert_eq!(error, "XAI_API_KEY is required when AI_PROVIDER=xai");
    }

    #[test]
    fn mock_provider_is_valid() {
        let config = base_config();
        assert!(config.validate().is_ok());
    }

    #[test]
    fn mock_voice_provider_is_valid() {
        let mut config = base_config();
        config.ai_voice_provider = "mock".to_owned();

        assert!(config.validate().is_ok());
    }

    #[test]
    fn openai_voice_provider_requires_api_key() {
        let mut config = base_config();
        config.ai_voice_provider = "openai".to_owned();

        let error = config
            .validate()
            .expect_err("openai voice should require api key");
        assert_eq!(
            error,
            "OPENAI_API_KEY is required when AI_VOICE_PROVIDER=openai"
        );
    }

    #[test]
    fn openai_voice_provider_requires_voice_id() {
        let mut config = base_config();
        config.ai_voice_provider = "openai".to_owned();
        config.openai_api_key = Some("test-key".to_owned());
        config.ai_voice_id = "".to_owned();

        let error = config
            .validate()
            .expect_err("openai voice should require voice id");
        assert_eq!(
            error,
            "AI_VOICE_ID is required when AI_VOICE_PROVIDER=openai"
        );
    }

    #[test]
    fn openai_voice_provider_rejects_unsupported_format() {
        let mut config = base_config();
        config.ai_voice_provider = "openai".to_owned();
        config.openai_api_key = Some("test-key".to_owned());
        config.ai_voice_format = "pcm".to_owned();

        let error = config
            .validate()
            .expect_err("unsupported voice format should fail");
        assert_eq!(
            error,
            "AI_VOICE_FORMAT=pcm is invalid. Allowed values: mp3, wav"
        );
    }

    #[test]
    fn voicevox_voice_provider_requires_speaker_id() {
        let mut config = base_config();
        config.ai_voice_provider = "voicevox".to_owned();

        let error = config
            .validate()
            .expect_err("voicevox voice should require speaker id");
        assert_eq!(
            error,
            "VOICEVOX_SPEAKER_ID is required when AI_VOICE_PROVIDER=voicevox"
        );
    }

    #[test]
    fn voicevox_voice_provider_is_valid_with_base_url_and_speaker_id() {
        let mut config = base_config();
        config.ai_voice_provider = "voicevox".to_owned();
        config.voicevox_base_url = "http://voicevox:50021".to_owned();
        config.voicevox_speaker_id = "1".to_owned();

        assert!(config.validate().is_ok());
    }

    #[test]
    fn voice_speech_text_policy_accepts_japanese_translation() {
        let mut config = base_config();
        config.ai_voice_speech_text_policy = "japanese_translation".to_owned();

        assert!(config.validate().is_ok());
    }

    #[test]
    fn unknown_voice_speech_text_policy_is_invalid() {
        let mut config = base_config();
        config.ai_voice_speech_text_policy = "same_language".to_owned();

        let error = config
            .validate()
            .expect_err("unknown speech text policy should fail");
        assert_eq!(
            error,
            "AI_VOICE_SPEECH_TEXT_POLICY=same_language is invalid. Allowed values: original, japanese_translation"
        );
    }

    #[test]
    fn unknown_voice_provider_is_invalid() {
        let mut config = base_config();
        config.ai_voice_provider = "browser".to_owned();

        let error = config
            .validate()
            .expect_err("unknown voice provider should fail");
        assert_eq!(
            error,
            "AI_VOICE_PROVIDER=browser is invalid. Allowed values: disabled, mock, openai, voicevox"
        );
    }

    #[test]
    fn mock_transcription_provider_is_valid() {
        let mut config = base_config();
        config.ai_transcription_provider = "mock".to_owned();

        assert!(config.validate().is_ok());
    }

    #[test]
    fn openai_transcription_provider_requires_api_key() {
        let mut config = base_config();
        config.ai_transcription_provider = "openai".to_owned();

        let error = config
            .validate()
            .expect_err("openai transcription should require api key");
        assert_eq!(
            error,
            "OPENAI_API_KEY is required when AI_TRANSCRIPTION_PROVIDER=openai"
        );
    }

    #[test]
    fn openai_transcription_provider_requires_model() {
        let mut config = base_config();
        config.ai_transcription_provider = "openai".to_owned();
        config.openai_api_key = Some("test-key".to_owned());
        config.ai_transcription_model = "".to_owned();

        let error = config
            .validate()
            .expect_err("openai transcription should require model");
        assert_eq!(
            error,
            "AI_TRANSCRIPTION_MODEL is required when AI_TRANSCRIPTION_PROVIDER=openai"
        );
    }

    #[test]
    fn unknown_transcription_provider_is_invalid() {
        let mut config = base_config();
        config.ai_transcription_provider = "browser".to_owned();

        let error = config
            .validate()
            .expect_err("unknown transcription provider should fail");
        assert_eq!(
            error,
            "AI_TRANSCRIPTION_PROVIDER=browser is invalid. Allowed values: disabled, mock, openai"
        );
    }
}
