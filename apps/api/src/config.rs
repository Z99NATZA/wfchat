use std::{env, net::SocketAddr};

use ipnet::IpNet;
use reqwest::Url;

const PRODUCTION_MESSAGE_MAX_CHARS: usize = 16_000;
const PRODUCTION_REQUEST_MAX_BYTES: usize = 262_144;
const PRODUCTION_CONTEXT_MAX_MESSAGES: usize = 200;
const PRODUCTION_CONTEXT_MAX_CHARS: usize = 200_000;
const PRODUCTION_OUTPUT_MAX_TOKENS: u32 = 8_192;
const PRODUCTION_OUTPUT_MAX_CHARS: usize = 65_536;
const PRODUCTION_AI_CONNECT_TIMEOUT_SECONDS: u64 = 30;
const PRODUCTION_AI_IDLE_TIMEOUT_SECONDS: u64 = 120;
const PRODUCTION_AI_TOTAL_TIMEOUT_SECONDS: u64 = 300;
const PRODUCTION_MAX_CONCURRENT_GENERATIONS: usize = 128;
const PRODUCTION_MAX_CONCURRENT_PER_SESSION: usize = 8;
const PRODUCTION_GLOBAL_REQUESTS_PER_MINUTE: u32 = 6_000;

const RESERVED_PRODUCTION_HOSTS: [&str; 10] = [
    "localhost",
    "local",
    "internal",
    "lan",
    "home",
    "home.arpa",
    "test",
    "invalid",
    "example",
    "onion",
];

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AppEnvironment {
    Development,
    Production,
}

#[derive(Clone, Debug)]
pub struct SecurityConfig {
    pub environment: AppEnvironment,
    pub allow_session_header: bool,
    pub trust_proxy_headers: bool,
    pub trusted_proxy_cidrs: Vec<IpNet>,
    pub chat: ChatSecurityConfig,
}

#[derive(Clone, Debug)]
pub struct ChatSecurityConfig {
    pub message_max_chars: usize,
    pub request_max_bytes: usize,
    pub context_max_messages: usize,
    pub context_max_chars: usize,
    pub output_max_tokens: u32,
    pub output_max_chars: usize,
    pub ai_connect_timeout_seconds: u64,
    pub ai_total_timeout_seconds: u64,
    pub ai_idle_timeout_seconds: u64,
    pub max_concurrent_generations: usize,
    pub max_concurrent_per_session: usize,
    pub global_requests_per_minute: u32,
    pub image_upload_enabled: bool,
    pub transcription_enabled: bool,
    pub tts_enabled: bool,
}

impl Default for SecurityConfig {
    fn default() -> Self {
        Self {
            environment: AppEnvironment::Development,
            allow_session_header: true,
            trust_proxy_headers: false,
            trusted_proxy_cidrs: Vec::new(),
            chat: ChatSecurityConfig::default(),
        }
    }
}

impl Default for ChatSecurityConfig {
    fn default() -> Self {
        Self {
            message_max_chars: 4_000,
            request_max_bytes: 64 * 1024,
            context_max_messages: 40,
            context_max_chars: 32_000,
            output_max_tokens: 1_024,
            output_max_chars: 16_384,
            ai_connect_timeout_seconds: 10,
            ai_total_timeout_seconds: 60,
            ai_idle_timeout_seconds: 20,
            max_concurrent_generations: 8,
            max_concurrent_per_session: 2,
            global_requests_per_minute: 120,
            image_upload_enabled: true,
            transcription_enabled: true,
            tts_enabled: true,
        }
    }
}

#[derive(Clone, Debug)]
pub struct Config {
    pub app_host: String,
    pub app_port: u16,
    pub frontend_origin: String,
    pub ai_provider: String,
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
    pub voicevox_speed_scale: Option<f32>,
    pub voicevox_pitch_scale: Option<f32>,
    pub voicevox_intonation_scale: Option<f32>,
    pub voicevox_volume_scale: Option<f32>,
    pub voicevox_pre_phoneme_length: Option<f32>,
    pub voicevox_post_phoneme_length: Option<f32>,
    pub google_client_id: Option<String>,
    pub chat_attachment_upload_dir: String,
    pub chat_attachment_max_bytes: usize,
    pub chat_attachment_max_images_per_message: usize,
    pub chat_attachment_max_width: u32,
    pub chat_attachment_max_height: u32,
    pub chat_attachment_max_pixels: u64,
    pub security: SecurityConfig,
}

impl Config {
    pub fn from_env() -> Result<Self, String> {
        let environment = parse_app_environment(&env_value("APP_ENV", "development"))?;
        let is_production = environment == AppEnvironment::Production;
        let trust_proxy_headers = bool_env_value("TRUST_PROXY_HEADERS", false)?;
        let trusted_proxy_cidrs = parse_trusted_proxy_cidrs(&env_value("TRUSTED_PROXY_CIDRS", ""))?;
        let security = SecurityConfig {
            environment,
            allow_session_header: bool_env_value("ALLOW_SESSION_HEADER", !is_production)?,
            trust_proxy_headers,
            trusted_proxy_cidrs,
            chat: ChatSecurityConfig {
                message_max_chars: parsed_env_value("CHAT_MESSAGE_MAX_CHARS", 4_000)?,
                request_max_bytes: parsed_env_value("CHAT_REQUEST_MAX_BYTES", 64 * 1024)?,
                context_max_messages: parsed_env_value("CHAT_CONTEXT_MAX_MESSAGES", 40)?,
                context_max_chars: parsed_env_value("CHAT_CONTEXT_MAX_CHARS", 32_000)?,
                output_max_tokens: parsed_env_value("CHAT_OUTPUT_MAX_TOKENS", 1_024)?,
                output_max_chars: parsed_env_value("CHAT_OUTPUT_MAX_CHARS", 16_384)?,
                ai_connect_timeout_seconds: parsed_env_value(
                    "CHAT_AI_CONNECT_TIMEOUT_SECONDS",
                    10,
                )?,
                ai_total_timeout_seconds: parsed_env_value("CHAT_AI_TOTAL_TIMEOUT_SECONDS", 60)?,
                ai_idle_timeout_seconds: parsed_env_value("CHAT_AI_IDLE_TIMEOUT_SECONDS", 20)?,
                max_concurrent_generations: parsed_env_value("CHAT_MAX_CONCURRENT_GENERATIONS", 8)?,
                max_concurrent_per_session: parsed_env_value("CHAT_MAX_CONCURRENT_PER_SESSION", 2)?,
                global_requests_per_minute: parsed_env_value(
                    "CHAT_GLOBAL_REQUESTS_PER_MINUTE",
                    120,
                )?,
                image_upload_enabled: bool_env_value("CHAT_IMAGE_UPLOAD_ENABLED", !is_production)?,
                transcription_enabled: bool_env_value(
                    "CHAT_TRANSCRIPTION_ENABLED",
                    !is_production,
                )?,
                tts_enabled: bool_env_value("CHAT_TTS_ENABLED", !is_production)?,
            },
        };
        let config = Self {
            app_host: env_value("APP_HOST", "0.0.0.0"),
            app_port: env_value("APP_PORT", "8080").parse().unwrap_or(8080),
            frontend_origin: env_value(
                "FRONTEND_ORIGINS",
                &env_value("FRONTEND_ORIGIN", "http://localhost:5173"),
            ),
            ai_provider: env_value("AI_PROVIDER", "mock"),
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
            voicevox_speed_scale: optional_f32_env_value("VOICEVOX_SPEED_SCALE")?,
            voicevox_pitch_scale: optional_f32_env_value("VOICEVOX_PITCH_SCALE")?,
            voicevox_intonation_scale: optional_f32_env_value("VOICEVOX_INTONATION_SCALE")?,
            voicevox_volume_scale: optional_f32_env_value("VOICEVOX_VOLUME_SCALE")?,
            voicevox_pre_phoneme_length: optional_f32_env_value("VOICEVOX_PRE_PHONEME_LENGTH")?,
            voicevox_post_phoneme_length: optional_f32_env_value("VOICEVOX_POST_PHONEME_LENGTH")?,
            google_client_id: optional_env_value("GOOGLE_CLIENT_ID"),
            chat_attachment_upload_dir: env_value("CHAT_ATTACHMENT_UPLOAD_DIR", "data/uploads"),
            chat_attachment_max_bytes: env_value("CHAT_ATTACHMENT_MAX_BYTES", "10485760")
                .parse()
                .unwrap_or(10 * 1024 * 1024),
            chat_attachment_max_images_per_message: env_value(
                "CHAT_ATTACHMENT_MAX_IMAGES_PER_MESSAGE",
                "4",
            )
            .parse()
            .unwrap_or(4),
            chat_attachment_max_width: env_value("CHAT_ATTACHMENT_MAX_WIDTH", "8192")
                .parse()
                .unwrap_or(8192),
            chat_attachment_max_height: env_value("CHAT_ATTACHMENT_MAX_HEIGHT", "8192")
                .parse()
                .unwrap_or(8192),
            chat_attachment_max_pixels: env_value("CHAT_ATTACHMENT_MAX_PIXELS", "20000000")
                .parse()
                .unwrap_or(20_000_000),
            security,
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
            "mock" => "mock-waifu",
            _ => "unknown",
        }
    }

    pub fn is_production(&self) -> bool {
        self.security.environment == AppEnvironment::Production
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
                )?;
                validate_finite_f32(
                    self.voicevox_pitch_scale,
                    "VOICEVOX_PITCH_SCALE must be a finite number",
                )?;
                validate_non_negative_f32(
                    self.voicevox_speed_scale,
                    "VOICEVOX_SPEED_SCALE must be a non-negative number",
                )?;
                validate_non_negative_f32(
                    self.voicevox_intonation_scale,
                    "VOICEVOX_INTONATION_SCALE must be a non-negative number",
                )?;
                validate_non_negative_f32(
                    self.voicevox_volume_scale,
                    "VOICEVOX_VOLUME_SCALE must be a non-negative number",
                )?;
                validate_non_negative_f32(
                    self.voicevox_pre_phoneme_length,
                    "VOICEVOX_PRE_PHONEME_LENGTH must be a non-negative number",
                )?;
                validate_non_negative_f32(
                    self.voicevox_post_phoneme_length,
                    "VOICEVOX_POST_PHONEME_LENGTH must be a non-negative number",
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
        }?;
        self.validate_chat_attachment_config()?;
        self.validate_security_config()
    }

    fn validate_chat_attachment_config(&self) -> Result<(), String> {
        require_non_empty(
            Some(self.chat_attachment_upload_dir.as_str()),
            "CHAT_ATTACHMENT_UPLOAD_DIR is required",
        )?;
        if self.chat_attachment_max_bytes == 0 {
            return Err("CHAT_ATTACHMENT_MAX_BYTES must be greater than 0".to_owned());
        }
        if self.chat_attachment_max_images_per_message == 0 {
            return Err("CHAT_ATTACHMENT_MAX_IMAGES_PER_MESSAGE must be greater than 0".to_owned());
        }
        if self.chat_attachment_max_width == 0 {
            return Err("CHAT_ATTACHMENT_MAX_WIDTH must be greater than 0".to_owned());
        }
        if self.chat_attachment_max_height == 0 {
            return Err("CHAT_ATTACHMENT_MAX_HEIGHT must be greater than 0".to_owned());
        }
        if self.chat_attachment_max_pixels == 0 {
            return Err("CHAT_ATTACHMENT_MAX_PIXELS must be greater than 0".to_owned());
        }

        Ok(())
    }

    fn validate_security_config(&self) -> Result<(), String> {
        let chat = &self.security.chat;
        if chat.message_max_chars == 0
            || chat.request_max_bytes == 0
            || chat.context_max_messages == 0
            || chat.context_max_chars == 0
            || chat.output_max_tokens == 0
            || chat.output_max_chars == 0
            || chat.ai_connect_timeout_seconds == 0
            || chat.ai_total_timeout_seconds == 0
            || chat.ai_idle_timeout_seconds == 0
            || chat.max_concurrent_generations == 0
            || chat.max_concurrent_per_session == 0
            || chat.global_requests_per_minute == 0
        {
            return Err("chat security limits must be greater than 0".to_owned());
        }
        if chat.max_concurrent_per_session > chat.max_concurrent_generations {
            return Err(
                "CHAT_MAX_CONCURRENT_PER_SESSION must not exceed CHAT_MAX_CONCURRENT_GENERATIONS"
                    .to_owned(),
            );
        }
        if chat.ai_connect_timeout_seconds > chat.ai_total_timeout_seconds {
            return Err(
                "CHAT_AI_CONNECT_TIMEOUT_SECONDS must not exceed CHAT_AI_TOTAL_TIMEOUT_SECONDS"
                    .to_owned(),
            );
        }
        if chat.ai_idle_timeout_seconds > chat.ai_total_timeout_seconds {
            return Err(
                "CHAT_AI_IDLE_TIMEOUT_SECONDS must not exceed CHAT_AI_TOTAL_TIMEOUT_SECONDS"
                    .to_owned(),
            );
        }
        if chat.max_concurrent_generations > tokio::sync::Semaphore::MAX_PERMITS
            || chat.max_concurrent_per_session > tokio::sync::Semaphore::MAX_PERMITS
        {
            return Err(format!(
                "chat concurrency limits must not exceed Tokio semaphore maximum ({})",
                tokio::sync::Semaphore::MAX_PERMITS
            ));
        }
        if self.security.trust_proxy_headers && self.security.trusted_proxy_cidrs.is_empty() {
            return Err(
                "TRUSTED_PROXY_CIDRS must not be empty when TRUST_PROXY_HEADERS=true".to_owned(),
            );
        }

        if !self.is_production() {
            return Ok(());
        }
        if self.security.allow_session_header {
            return Err("ALLOW_SESSION_HEADER must be false in production".to_owned());
        }

        validate_production_max(
            "CHAT_MESSAGE_MAX_CHARS",
            chat.message_max_chars,
            PRODUCTION_MESSAGE_MAX_CHARS,
        )?;
        validate_production_max(
            "CHAT_REQUEST_MAX_BYTES",
            chat.request_max_bytes,
            PRODUCTION_REQUEST_MAX_BYTES,
        )?;
        validate_production_max(
            "CHAT_CONTEXT_MAX_MESSAGES",
            chat.context_max_messages,
            PRODUCTION_CONTEXT_MAX_MESSAGES,
        )?;
        validate_production_max(
            "CHAT_CONTEXT_MAX_CHARS",
            chat.context_max_chars,
            PRODUCTION_CONTEXT_MAX_CHARS,
        )?;
        validate_production_max(
            "CHAT_OUTPUT_MAX_TOKENS",
            chat.output_max_tokens,
            PRODUCTION_OUTPUT_MAX_TOKENS,
        )?;
        validate_production_max(
            "CHAT_OUTPUT_MAX_CHARS",
            chat.output_max_chars,
            PRODUCTION_OUTPUT_MAX_CHARS,
        )?;
        validate_production_max(
            "CHAT_AI_CONNECT_TIMEOUT_SECONDS",
            chat.ai_connect_timeout_seconds,
            PRODUCTION_AI_CONNECT_TIMEOUT_SECONDS,
        )?;
        validate_production_max(
            "CHAT_AI_IDLE_TIMEOUT_SECONDS",
            chat.ai_idle_timeout_seconds,
            PRODUCTION_AI_IDLE_TIMEOUT_SECONDS,
        )?;
        validate_production_max(
            "CHAT_AI_TOTAL_TIMEOUT_SECONDS",
            chat.ai_total_timeout_seconds,
            PRODUCTION_AI_TOTAL_TIMEOUT_SECONDS,
        )?;
        validate_production_max(
            "CHAT_MAX_CONCURRENT_GENERATIONS",
            chat.max_concurrent_generations,
            PRODUCTION_MAX_CONCURRENT_GENERATIONS,
        )?;
        validate_production_max(
            "CHAT_MAX_CONCURRENT_PER_SESSION",
            chat.max_concurrent_per_session,
            PRODUCTION_MAX_CONCURRENT_PER_SESSION,
        )?;
        validate_production_max(
            "CHAT_GLOBAL_REQUESTS_PER_MINUTE",
            chat.global_requests_per_minute,
            PRODUCTION_GLOBAL_REQUESTS_PER_MINUTE,
        )?;

        for origin in self.frontend_origin.split(',').map(str::trim) {
            validate_production_origin(origin)?;
        }

        Ok(())
    }
}

fn env_value(key: &str, fallback: &str) -> String {
    env::var(key).unwrap_or_else(|_| fallback.to_owned())
}

fn optional_env_value(key: &str) -> Option<String> {
    env::var(key).ok().filter(|value| !value.trim().is_empty())
}

fn parsed_env_value<T>(key: &str, fallback: T) -> Result<T, String>
where
    T: std::str::FromStr + Copy,
{
    let Some(value) = optional_env_value(key) else {
        return Ok(fallback);
    };
    value
        .trim()
        .parse::<T>()
        .map_err(|_| format!("{key} has an invalid value"))
}

fn parse_trusted_proxy_cidrs(value: &str) -> Result<Vec<IpNet>, String> {
    if value.trim().is_empty() {
        return Ok(Vec::new());
    }

    value
        .split(',')
        .map(|cidr| {
            let cidr = cidr.trim();
            if cidr.is_empty() {
                return Err("TRUSTED_PROXY_CIDRS contains an invalid CIDR".to_owned());
            }
            cidr.parse::<IpNet>()
                .map_err(|_| format!("TRUSTED_PROXY_CIDRS contains an invalid CIDR: {cidr}"))
        })
        .collect()
}

fn validate_production_max<T>(key: &str, value: T, maximum: T) -> Result<(), String>
where
    T: Copy + PartialOrd + std::fmt::Display,
{
    if value > maximum {
        Err(format!("{key} must not exceed {maximum} in production"))
    } else {
        Ok(())
    }
}

fn bool_env_value(key: &str, fallback: bool) -> Result<bool, String> {
    let Some(value) = optional_env_value(key) else {
        return Ok(fallback);
    };
    match value.trim().to_ascii_lowercase().as_str() {
        "true" | "1" | "yes" | "on" => Ok(true),
        "false" | "0" | "no" | "off" => Ok(false),
        _ => Err(format!("{key} must be true or false")),
    }
}

fn parse_app_environment(value: &str) -> Result<AppEnvironment, String> {
    match value.trim().to_ascii_lowercase().as_str() {
        "development" | "dev" => Ok(AppEnvironment::Development),
        "production" | "prod" => Ok(AppEnvironment::Production),
        _ => Err("APP_ENV must be development or production".to_owned()),
    }
}

fn validate_production_origin(origin: &str) -> Result<(), String> {
    let url = Url::parse(origin).map_err(|_| "production frontend origins must be valid URLs")?;
    if url.scheme() != "https" {
        return Err("production frontend origins must use https".to_owned());
    }
    if url.username() != ""
        || url.password().is_some()
        || url.path() != "/"
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(
            "production frontend origins must contain only scheme, host, and port".to_owned(),
        );
    }
    let host = url
        .host_str()
        .ok_or_else(|| "production frontend origins must include a host".to_owned())?;
    let host = host.trim_end_matches('.').to_ascii_lowercase();
    if host.is_empty() || host.parse::<std::net::IpAddr>().is_ok() || !host.contains('.') {
        return Err("production frontend origins must use a public DNS hostname".to_owned());
    }
    if RESERVED_PRODUCTION_HOSTS
        .iter()
        .any(|reserved| host == *reserved || host.ends_with(&format!(".{reserved}")))
    {
        return Err("production frontend origins must use a public DNS hostname".to_owned());
    }

    Ok(())
}

fn optional_f32_env_value(key: &str) -> Result<Option<f32>, String> {
    let Some(value) = optional_env_value(key) else {
        return Ok(None);
    };
    let parsed = value
        .trim()
        .parse::<f32>()
        .map_err(|_| format!("{key} must be a number"))?;
    if parsed.is_finite() {
        Ok(Some(parsed))
    } else {
        Err(format!("{key} must be a finite number"))
    }
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

fn validate_non_negative_f32(value: Option<f32>, message: &str) -> Result<(), String> {
    if value
        .map(|value| value.is_finite() && value >= 0.0)
        .unwrap_or(true)
    {
        Ok(())
    } else {
        Err(message.to_owned())
    }
}

fn validate_finite_f32(value: Option<f32>, message: &str) -> Result<(), String> {
    if value.map(f32::is_finite).unwrap_or(true) {
        Ok(())
    } else {
        Err(message.to_owned())
    }
}

#[cfg(test)]
mod tests {
    use super::{
        parse_trusted_proxy_cidrs, AppEnvironment, Config, SecurityConfig,
        PRODUCTION_AI_CONNECT_TIMEOUT_SECONDS, PRODUCTION_AI_IDLE_TIMEOUT_SECONDS,
        PRODUCTION_AI_TOTAL_TIMEOUT_SECONDS, PRODUCTION_CONTEXT_MAX_CHARS,
        PRODUCTION_CONTEXT_MAX_MESSAGES, PRODUCTION_GLOBAL_REQUESTS_PER_MINUTE,
        PRODUCTION_MAX_CONCURRENT_GENERATIONS, PRODUCTION_MAX_CONCURRENT_PER_SESSION,
        PRODUCTION_MESSAGE_MAX_CHARS, PRODUCTION_OUTPUT_MAX_CHARS, PRODUCTION_OUTPUT_MAX_TOKENS,
        PRODUCTION_REQUEST_MAX_BYTES,
    };

    fn base_config() -> Config {
        Config {
            app_host: "0.0.0.0".to_owned(),
            app_port: 8080,
            frontend_origin: "http://localhost:5173".to_owned(),
            ai_provider: "mock".to_owned(),
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
            voicevox_speed_scale: None,
            voicevox_pitch_scale: None,
            voicevox_intonation_scale: None,
            voicevox_volume_scale: None,
            voicevox_pre_phoneme_length: None,
            voicevox_post_phoneme_length: None,
            google_client_id: None,
            chat_attachment_upload_dir: "data/uploads".to_owned(),
            chat_attachment_max_bytes: 10 * 1024 * 1024,
            chat_attachment_max_images_per_message: 4,
            chat_attachment_max_width: 8192,
            chat_attachment_max_height: 8192,
            chat_attachment_max_pixels: 20_000_000,
            security: SecurityConfig::default(),
        }
    }

    fn production_config() -> Config {
        let mut config = base_config();
        config.security.environment = AppEnvironment::Production;
        config.security.allow_session_header = false;
        config.frontend_origin = "https://chat.example.com".to_owned();
        config
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
    fn voicevox_voice_provider_accepts_tuning_config() {
        let mut config = base_config();
        config.ai_voice_provider = "voicevox".to_owned();
        config.voicevox_base_url = "http://voicevox:50021".to_owned();
        config.voicevox_speaker_id = "1".to_owned();
        config.voicevox_speed_scale = Some(1.1);
        config.voicevox_pitch_scale = Some(-0.03);
        config.voicevox_intonation_scale = Some(1.2);
        config.voicevox_volume_scale = Some(0.9);
        config.voicevox_pre_phoneme_length = Some(0.05);
        config.voicevox_post_phoneme_length = Some(0.08);

        assert!(config.validate().is_ok());
    }

    #[test]
    fn voicevox_voice_provider_rejects_negative_non_pitch_tuning() {
        let mut config = base_config();
        config.ai_voice_provider = "voicevox".to_owned();
        config.voicevox_base_url = "http://voicevox:50021".to_owned();
        config.voicevox_speaker_id = "1".to_owned();
        config.voicevox_speed_scale = Some(-1.0);

        let error = config
            .validate()
            .expect_err("negative speed scale should fail");
        assert_eq!(error, "VOICEVOX_SPEED_SCALE must be a non-negative number");
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

    #[test]
    fn attachment_upload_dir_is_required() {
        let mut config = base_config();
        config.chat_attachment_upload_dir = "".to_owned();

        let error = config
            .validate()
            .expect_err("upload directory should be required");

        assert_eq!(error, "CHAT_ATTACHMENT_UPLOAD_DIR is required");
    }

    #[test]
    fn attachment_limits_must_be_positive() {
        let mut config = base_config();
        config.chat_attachment_max_bytes = 0;

        let error = config
            .validate()
            .expect_err("zero byte limit should be rejected");

        assert_eq!(error, "CHAT_ATTACHMENT_MAX_BYTES must be greater than 0");
    }

    #[test]
    fn production_requires_https_public_origin_and_disables_session_header() {
        let mut config = base_config();
        config.security.environment = AppEnvironment::Production;

        assert_eq!(
            config.validate().expect_err("session header should fail"),
            "ALLOW_SESSION_HEADER must be false in production"
        );

        config.security.allow_session_header = false;
        assert_eq!(
            config.validate().expect_err("http origin should fail"),
            "production frontend origins must use https"
        );

        config.frontend_origin = "https://chat.example.com".to_owned();
        assert!(config.validate().is_ok());
    }

    #[test]
    fn production_rejects_private_origins() {
        let mut config = production_config();

        for reserved in super::RESERVED_PRODUCTION_HOSTS {
            for origin in [
                format!("https://{reserved}"),
                format!("https://app.{reserved}"),
            ] {
                config.frontend_origin = origin.clone();
                assert_eq!(
                    config.validate().expect_err("reserved origin should fail"),
                    "production frontend origins must use a public DNS hostname",
                    "origin should be rejected: {origin}",
                );
            }
        }

        for origin in [
            "https://localhost",
            "https://localhost.",
            "https://LOCALHOST",
            "https://intranet",
            "https://127.0.0.1",
            "https://192.168.1.20",
            "https://8.8.8.8",
            "https://[::1]",
            "https://[fe80::1]",
            "https://[::ffff:127.0.0.1]",
        ] {
            config.frontend_origin = origin.to_owned();
            assert_eq!(
                config.validate().expect_err("private origin should fail"),
                "production frontend origins must use a public DNS hostname",
                "origin should be rejected: {origin}",
            );
        }
    }

    #[test]
    fn production_origin_accepts_only_origin_shape() {
        let mut config = production_config();
        for origin in [
            "https://user@chat.example.com",
            "https://chat.example.com/path",
            "https://chat.example.com?query=1",
            "https://chat.example.com#fragment",
        ] {
            config.frontend_origin = origin.to_owned();
            assert!(config.validate().is_err(), "origin should fail: {origin}");
        }

        config.frontend_origin = "https://CHAT.Example.COM.:8443".to_owned();
        assert!(config.validate().is_ok());
    }

    #[test]
    fn production_enforces_every_locked_chat_maximum() {
        macro_rules! assert_max {
            ($field:ident, $maximum:expr) => {{
                let mut config = production_config();
                config.security.chat.$field = $maximum;
                assert!(config.validate().is_ok(), stringify!($field));
                config.security.chat.$field = $maximum + 1;
                assert!(config.validate().is_err(), stringify!($field));
            }};
        }

        assert_max!(message_max_chars, PRODUCTION_MESSAGE_MAX_CHARS);
        assert_max!(request_max_bytes, PRODUCTION_REQUEST_MAX_BYTES);
        assert_max!(context_max_messages, PRODUCTION_CONTEXT_MAX_MESSAGES);
        assert_max!(context_max_chars, PRODUCTION_CONTEXT_MAX_CHARS);
        assert_max!(output_max_tokens, PRODUCTION_OUTPUT_MAX_TOKENS);
        assert_max!(output_max_chars, PRODUCTION_OUTPUT_MAX_CHARS);
        assert_max!(
            ai_connect_timeout_seconds,
            PRODUCTION_AI_CONNECT_TIMEOUT_SECONDS
        );
        assert_max!(
            ai_total_timeout_seconds,
            PRODUCTION_AI_TOTAL_TIMEOUT_SECONDS
        );

        let mut idle = production_config();
        idle.security.chat.ai_total_timeout_seconds = PRODUCTION_AI_TOTAL_TIMEOUT_SECONDS;
        idle.security.chat.ai_idle_timeout_seconds = PRODUCTION_AI_IDLE_TIMEOUT_SECONDS;
        assert!(idle.validate().is_ok());
        idle.security.chat.ai_idle_timeout_seconds = PRODUCTION_AI_IDLE_TIMEOUT_SECONDS + 1;
        assert!(idle.validate().is_err());

        assert_max!(
            max_concurrent_generations,
            PRODUCTION_MAX_CONCURRENT_GENERATIONS
        );
        let mut per_session = production_config();
        per_session.security.chat.max_concurrent_generations =
            PRODUCTION_MAX_CONCURRENT_GENERATIONS;
        per_session.security.chat.max_concurrent_per_session =
            PRODUCTION_MAX_CONCURRENT_PER_SESSION;
        assert!(per_session.validate().is_ok());
        per_session.security.chat.max_concurrent_per_session =
            PRODUCTION_MAX_CONCURRENT_PER_SESSION + 1;
        assert!(per_session.validate().is_err());

        assert_max!(
            global_requests_per_minute,
            PRODUCTION_GLOBAL_REQUESTS_PER_MINUTE
        );
    }

    #[test]
    fn development_accepts_values_above_production_maxima() {
        let mut config = base_config();
        let chat = &mut config.security.chat;
        chat.message_max_chars = PRODUCTION_MESSAGE_MAX_CHARS + 1;
        chat.request_max_bytes = PRODUCTION_REQUEST_MAX_BYTES + 1;
        chat.context_max_messages = PRODUCTION_CONTEXT_MAX_MESSAGES + 1;
        chat.context_max_chars = PRODUCTION_CONTEXT_MAX_CHARS + 1;
        chat.output_max_tokens = PRODUCTION_OUTPUT_MAX_TOKENS + 1;
        chat.output_max_chars = PRODUCTION_OUTPUT_MAX_CHARS + 1;
        chat.ai_connect_timeout_seconds = PRODUCTION_AI_CONNECT_TIMEOUT_SECONDS + 1;
        chat.ai_idle_timeout_seconds = PRODUCTION_AI_IDLE_TIMEOUT_SECONDS + 1;
        chat.ai_total_timeout_seconds = PRODUCTION_AI_TOTAL_TIMEOUT_SECONDS + 1;
        chat.max_concurrent_generations = PRODUCTION_MAX_CONCURRENT_GENERATIONS + 1;
        chat.max_concurrent_per_session = PRODUCTION_MAX_CONCURRENT_PER_SESSION + 1;
        chat.global_requests_per_minute = PRODUCTION_GLOBAL_REQUESTS_PER_MINUTE + 1;

        assert!(config.validate().is_ok());
    }

    #[test]
    fn concurrency_above_tokio_maximum_is_rejected_without_constructing_semaphore() {
        let mut config = base_config();
        config.security.chat.max_concurrent_generations = tokio::sync::Semaphore::MAX_PERMITS + 1;

        assert!(config.validate().is_err());
    }

    #[test]
    fn trusted_proxy_configuration_is_strict_in_every_environment() {
        assert!(parse_trusted_proxy_cidrs("10.0.0.0/8, 2001:db8::/32").is_ok());
        assert!(parse_trusted_proxy_cidrs("10.0.0.1").is_err());
        assert!(parse_trusted_proxy_cidrs("10.0.0.0/8,").is_err());

        let mut config = base_config();
        config.security.trust_proxy_headers = true;
        assert_eq!(
            config
                .validate()
                .expect_err("trusted CIDRs must be required"),
            "TRUSTED_PROXY_CIDRS must not be empty when TRUST_PROXY_HEADERS=true"
        );
    }

    #[test]
    fn zero_and_invalid_relational_chat_limits_are_rejected() {
        let mut zero = base_config();
        zero.security.chat.output_max_chars = 0;
        assert!(zero.validate().is_err());

        let mut timeout = base_config();
        timeout.security.chat.ai_idle_timeout_seconds =
            timeout.security.chat.ai_total_timeout_seconds + 1;
        assert!(timeout.validate().is_err());

        let mut concurrency = base_config();
        concurrency.security.chat.max_concurrent_per_session =
            concurrency.security.chat.max_concurrent_generations + 1;
        assert!(concurrency.validate().is_err());
    }
}
