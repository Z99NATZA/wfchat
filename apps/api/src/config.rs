use std::{env, net::SocketAddr};

#[derive(Clone, Debug)]
pub struct Config {
    pub app_host: String,
    pub app_port: u16,
    pub frontend_origin: String,
    pub ai_provider: String,
    pub ai_model: String,
    pub database_url: String,
    pub openai_api_key: Option<String>,
    pub openai_base_url: String,
    pub openai_model: String,
    pub lmstudio_base_url: String,
    pub lmstudio_model: String,
    pub xai_api_key: Option<String>,
    pub xai_base_url: String,
    pub xai_model: String,
    pub google_client_id: Option<String>,
}

impl Config {
    pub fn from_env() -> Result<Self, String> {
        let config = Self {
            app_host: env_value("APP_HOST", "0.0.0.0"),
            app_port: env_value("APP_PORT", "8080").parse().unwrap_or(8080),
            frontend_origin: env_value("FRONTEND_ORIGIN", "http://localhost:5173"),
            ai_provider: env_value("AI_PROVIDER", "mock"),
            ai_model: env_value("AI_MODEL", "mock-waifu"),
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

    #[test]
    fn openai_requires_api_key() {
        let mut config = base_config();
        config.ai_provider = "openai".to_owned();

        let error = config.validate().expect_err("openai should require api key");
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
}
