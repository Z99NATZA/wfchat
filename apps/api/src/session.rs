use axum::http::{header::COOKIE, HeaderMap};
use uuid::Uuid;

use crate::config::Config;

const SESSION_COOKIE_NAME: &str = "wfchat_session";
const SESSION_HEADER_NAME: &str = "x-wfchat-session";

pub fn session_id_from_headers(headers: &HeaderMap) -> Option<Uuid> {
    session_id_from_cookie(headers).or_else(|| session_id_from_header(headers))
}

pub fn session_cookie(config: &Config, session_id: Uuid) -> String {
    let mut cookie = format!(
        "{SESSION_COOKIE_NAME}={session_id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000"
    );
    if should_use_secure_cookie(config) {
        cookie.push_str("; Secure");
    }
    cookie
}

fn session_id_from_header(headers: &HeaderMap) -> Option<Uuid> {
    headers
        .get(SESSION_HEADER_NAME)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| Uuid::parse_str(value).ok())
}

fn session_id_from_cookie(headers: &HeaderMap) -> Option<Uuid> {
    headers
        .get(COOKIE)
        .and_then(|value| value.to_str().ok())
        .and_then(|cookies| {
            cookies.split(';').find_map(|cookie| {
                let (name, value) = cookie.trim().split_once('=')?;
                (name == SESSION_COOKIE_NAME)
                    .then(|| Uuid::parse_str(value).ok())
                    .flatten()
            })
        })
}

fn should_use_secure_cookie(config: &Config) -> bool {
    config
        .frontend_origin
        .split(',')
        .map(str::trim)
        .filter(|origin| !origin.is_empty())
        .any(|origin| origin.starts_with("https://"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn headers_with_cookie(session_id: Uuid) -> HeaderMap {
        let mut headers = HeaderMap::new();
        headers.insert(
            COOKIE,
            format!("other=value; wfchat_session={session_id}; theme=dark")
                .parse()
                .expect("cookie should be a valid header value"),
        );
        headers
    }

    #[test]
    fn session_id_prefers_cookie_over_header() {
        let cookie_session_id = Uuid::new_v4();
        let header_session_id = Uuid::new_v4();
        let mut headers = headers_with_cookie(cookie_session_id);
        headers.insert(
            SESSION_HEADER_NAME,
            header_session_id
                .to_string()
                .parse()
                .expect("session id should be a valid header value"),
        );

        assert_eq!(session_id_from_headers(&headers), Some(cookie_session_id));
    }

    #[test]
    fn session_id_falls_back_to_header() {
        let session_id = Uuid::new_v4();
        let mut headers = HeaderMap::new();
        headers.insert(
            SESSION_HEADER_NAME,
            session_id
                .to_string()
                .parse()
                .expect("session id should be a valid header value"),
        );

        assert_eq!(session_id_from_headers(&headers), Some(session_id));
    }

    #[test]
    fn session_cookie_uses_secure_for_https_frontend_origin() {
        let config = Config {
            frontend_origin: "http://localhost:5173,https://chat.example.com".to_owned(),
            ..test_config()
        };

        let cookie = session_cookie(&config, Uuid::new_v4());

        assert!(cookie.contains("; HttpOnly"));
        assert!(cookie.contains("; SameSite=Lax"));
        assert!(cookie.contains("; Secure"));
    }

    #[test]
    fn session_cookie_omits_secure_for_http_frontend_origin() {
        let config = Config {
            frontend_origin: "http://localhost:5173".to_owned(),
            ..test_config()
        };

        let cookie = session_cookie(&config, Uuid::new_v4());

        assert!(!cookie.contains("; Secure"));
    }

    fn test_config() -> Config {
        Config {
            app_host: "127.0.0.1".to_owned(),
            app_port: 0,
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
        }
    }
}
