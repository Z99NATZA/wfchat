use std::{env, net::SocketAddr};

#[derive(Clone, Debug)]
pub struct Config {
    pub app_host: String,
    pub app_port: u16,
    pub frontend_origin: String,
    pub ai_provider: String,
    pub ai_model: String,
    pub data_path: String,
    pub openai_api_key: Option<String>,
    pub openai_base_url: String,
    pub openai_model: String,
    pub lmstudio_base_url: String,
    pub lmstudio_model: String,
    pub xai_api_key: Option<String>,
    pub xai_base_url: String,
    pub xai_model: String,
}

impl Config {
    pub fn from_env() -> Self {
        Self {
            app_host: env_value("APP_HOST", "0.0.0.0"),
            app_port: env_value("APP_PORT", "8080").parse().unwrap_or(8080),
            frontend_origin: env_value("FRONTEND_ORIGIN", "http://localhost:5173"),
            ai_provider: env_value("AI_PROVIDER", "mock"),
            ai_model: env_value("AI_MODEL", "mock-waifu"),
            data_path: env_value("DATA_PATH", "data/wfchat.json"),
            openai_api_key: optional_env_value("OPENAI_API_KEY"),
            openai_base_url: env_value("OPENAI_BASE_URL", "https://api.openai.com/v1"),
            openai_model: env_value("OPENAI_MODEL", "gpt-4.1-mini"),
            lmstudio_base_url: env_value("LMSTUDIO_BASE_URL", "http://localhost:1234/v1"),
            lmstudio_model: env_value("LMSTUDIO_MODEL", "local-model"),
            xai_api_key: optional_env_value("XAI_API_KEY"),
            xai_base_url: env_value("XAI_BASE_URL", "https://api.x.ai/v1"),
            xai_model: env_value("XAI_MODEL", "grok-3-mini"),
        }
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
}

fn env_value(key: &str, fallback: &str) -> String {
    env::var(key).unwrap_or_else(|_| fallback.to_owned())
}

fn optional_env_value(key: &str) -> Option<String> {
    env::var(key).ok().filter(|value| !value.trim().is_empty())
}
