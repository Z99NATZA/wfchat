use std::path::{Component, Path, PathBuf};

use image::GenericImageView;
use sha2::{Digest, Sha256};
use tokio::fs;
use uuid::Uuid;

use crate::{
    config::Config,
    error::{AppError, AppResult},
    store::ChatStore,
};

pub const CHAT_ATTACHMENT_KIND_IMAGE: &str = "image";
pub const MAX_ATTACHMENT_MULTIPART_BYTES: usize = 64 * 1024 * 1024;
pub const PENDING_ATTACHMENT_CLEANUP_AFTER_SECONDS: u64 = 24 * 60 * 60;
pub const PENDING_ATTACHMENT_CLEANUP_INTERVAL_SECONDS: u64 = 60 * 60;
const PENDING_ATTACHMENT_CLEANUP_BATCH_SIZE: i64 = 100;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ValidatedImageAttachment {
    pub mime_type: &'static str,
    pub extension: &'static str,
    pub byte_size: usize,
    pub width: u32,
    pub height: u32,
    pub sha256: String,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum SupportedImageFormat {
    Png,
    Jpeg,
    Webp,
    Gif,
}

impl SupportedImageFormat {
    fn mime_type(self) -> &'static str {
        match self {
            Self::Png => "image/png",
            Self::Jpeg => "image/jpeg",
            Self::Webp => "image/webp",
            Self::Gif => "image/gif",
        }
    }

    fn extension(self) -> &'static str {
        match self {
            Self::Png => "png",
            Self::Jpeg => "jpg",
            Self::Webp => "webp",
            Self::Gif => "gif",
        }
    }

    fn image_format(self) -> image::ImageFormat {
        match self {
            Self::Png => image::ImageFormat::Png,
            Self::Jpeg => image::ImageFormat::Jpeg,
            Self::Webp => image::ImageFormat::WebP,
            Self::Gif => image::ImageFormat::Gif,
        }
    }
}

pub fn validate_image_attachment(
    config: &Config,
    bytes: &[u8],
) -> AppResult<ValidatedImageAttachment> {
    if bytes.is_empty() {
        return Err(AppError::BadRequest("image attachment is empty".to_owned()));
    }
    if bytes.len() > config.chat_attachment_max_bytes {
        return Err(AppError::BadRequest(
            "image attachment is too large".to_owned(),
        ));
    }

    let format = detect_supported_image_format(bytes)
        .ok_or_else(|| AppError::BadRequest("image attachment type is not supported".to_owned()))?;
    let image = image::load_from_memory_with_format(bytes, format.image_format())
        .map_err(|_| AppError::BadRequest("image attachment is not a valid image".to_owned()))?;
    let (width, height) = image.dimensions();
    let pixel_count = u64::from(width) * u64::from(height);

    if width == 0 || height == 0 {
        return Err(AppError::BadRequest(
            "image attachment dimensions are invalid".to_owned(),
        ));
    }
    if width > config.chat_attachment_max_width {
        return Err(AppError::BadRequest(
            "image attachment width is too large".to_owned(),
        ));
    }
    if height > config.chat_attachment_max_height {
        return Err(AppError::BadRequest(
            "image attachment height is too large".to_owned(),
        ));
    }
    if pixel_count > config.chat_attachment_max_pixels {
        return Err(AppError::BadRequest(
            "image attachment has too many pixels".to_owned(),
        ));
    }

    Ok(ValidatedImageAttachment {
        mime_type: format.mime_type(),
        extension: format.extension(),
        byte_size: bytes.len(),
        width,
        height,
        sha256: sha256_hex(bytes),
    })
}

pub fn image_storage_key(attachment_id: Uuid, extension: &str) -> String {
    format!("chat-images/{attachment_id}.{extension}")
}

pub async fn write_attachment_bytes(
    upload_dir: &str,
    storage_key: &str,
    bytes: &[u8],
) -> AppResult<()> {
    let path = attachment_storage_path(upload_dir, storage_key)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .await
            .map_err(|_| AppError::BadRequest("failed to prepare attachment storage".to_owned()))?;
    }

    fs::write(path, bytes)
        .await
        .map_err(|_| AppError::BadRequest("failed to store attachment".to_owned()))
}

pub async fn read_attachment_bytes(upload_dir: &str, storage_key: &str) -> AppResult<Vec<u8>> {
    let path = attachment_storage_path(upload_dir, storage_key)?;
    fs::read(path).await.map_err(|_| AppError::NotFound)
}

pub async fn remove_attachment_file(upload_dir: &str, storage_key: &str) {
    if let Ok(path) = attachment_storage_path(upload_dir, storage_key) {
        let _ = fs::remove_file(path).await;
    }
}

pub async fn cleanup_stale_pending_chat_attachments(config: &Config, store: &ChatStore) -> usize {
    let stale_before = now_unix_seconds().saturating_sub(PENDING_ATTACHMENT_CLEANUP_AFTER_SECONDS);
    let attachments = store
        .mark_stale_pending_chat_attachments_deleted(
            CHAT_ATTACHMENT_KIND_IMAGE,
            stale_before,
            PENDING_ATTACHMENT_CLEANUP_BATCH_SIZE,
        )
        .await;
    let count = attachments.len();

    for attachment in attachments {
        remove_attachment_file(&config.chat_attachment_upload_dir, &attachment.storage_key).await;
    }

    count
}

fn attachment_storage_path(upload_dir: &str, storage_key: &str) -> AppResult<PathBuf> {
    let storage_key_path = Path::new(storage_key);
    if storage_key_path.is_absolute()
        || storage_key_path
            .components()
            .any(|component| !matches!(component, Component::Normal(_)))
    {
        return Err(AppError::BadRequest(
            "attachment storage key is invalid".to_owned(),
        ));
    }

    Ok(Path::new(upload_dir).join(storage_key_path))
}

fn detect_supported_image_format(bytes: &[u8]) -> Option<SupportedImageFormat> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Some(SupportedImageFormat::Png);
    }
    if bytes.len() >= 3 && bytes[0] == 0xff && bytes[1] == 0xd8 && bytes[2] == 0xff {
        return Some(SupportedImageFormat::Jpeg);
    }
    if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        return Some(SupportedImageFormat::Gif);
    }
    if bytes.len() >= 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP" {
        return Some(SupportedImageFormat::Webp);
    }

    None
}

fn sha256_hex(bytes: &[u8]) -> String {
    let hash = Sha256::digest(bytes);
    let mut output = String::with_capacity(hash.len() * 2);
    for byte in hash {
        output.push_str(&format!("{byte:02x}"));
    }
    output
}

fn now_unix_seconds() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use std::io::Cursor;

    use image::{DynamicImage, ImageBuffer, ImageFormat, Rgb};

    use super::*;

    fn test_config() -> Config {
        Config {
            app_host: "127.0.0.1".to_owned(),
            app_port: 0,
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

    fn image_bytes(width: u32, height: u32, format: ImageFormat) -> Vec<u8> {
        let image = ImageBuffer::from_pixel(width, height, Rgb([1, 2, 3]));
        let mut bytes = Cursor::new(Vec::new());
        DynamicImage::ImageRgb8(image)
            .write_to(&mut bytes, format)
            .expect("test image should encode");
        bytes.into_inner()
    }

    #[test]
    fn validate_image_attachment_accepts_png_bytes() {
        let config = test_config();
        let bytes = image_bytes(2, 3, ImageFormat::Png);

        let image = validate_image_attachment(&config, &bytes).expect("png should validate");

        assert_eq!(image.mime_type, "image/png");
        assert_eq!(image.extension, "png");
        assert_eq!(image.width, 2);
        assert_eq!(image.height, 3);
        assert_eq!(image.byte_size, bytes.len());
        assert_eq!(image.sha256.len(), 64);
    }

    #[test]
    fn validate_image_attachment_accepts_jpeg_bytes() {
        let config = test_config();
        let bytes = image_bytes(2, 3, ImageFormat::Jpeg);

        let image = validate_image_attachment(&config, &bytes).expect("jpeg should validate");

        assert_eq!(image.mime_type, "image/jpeg");
        assert_eq!(image.extension, "jpg");
        assert_eq!(image.width, 2);
        assert_eq!(image.height, 3);
    }

    #[test]
    fn validate_image_attachment_accepts_webp_bytes() {
        let config = test_config();
        let bytes = image_bytes(2, 3, ImageFormat::WebP);

        let image = validate_image_attachment(&config, &bytes).expect("webp should validate");

        assert_eq!(image.mime_type, "image/webp");
        assert_eq!(image.extension, "webp");
        assert_eq!(image.width, 2);
        assert_eq!(image.height, 3);
    }

    #[test]
    fn validate_image_attachment_accepts_gif_bytes() {
        let config = test_config();
        let bytes = image_bytes(2, 3, ImageFormat::Gif);

        let image = validate_image_attachment(&config, &bytes).expect("gif should validate");

        assert_eq!(image.mime_type, "image/gif");
        assert_eq!(image.extension, "gif");
        assert_eq!(image.width, 2);
        assert_eq!(image.height, 3);
    }

    #[test]
    fn validate_image_attachment_rejects_extensionless_svg_bytes() {
        let config = test_config();
        let bytes = br#"<svg xmlns="http://www.w3.org/2000/svg"></svg>"#;

        let error = validate_image_attachment(&config, bytes).expect_err("svg should be rejected");

        assert_eq!(
            error.to_string(),
            "bad request: image attachment type is not supported"
        );
    }

    #[test]
    fn validate_image_attachment_rejects_bad_magic_with_png_content_type_claim() {
        let config = test_config();
        let bytes = b"not actually a png";

        let error =
            validate_image_attachment(&config, bytes).expect_err("bad magic should be rejected");

        assert_eq!(
            error.to_string(),
            "bad request: image attachment type is not supported"
        );
    }

    #[test]
    fn validate_image_attachment_rejects_oversized_dimensions() {
        let mut config = test_config();
        config.chat_attachment_max_width = 1;
        let bytes = image_bytes(2, 1, ImageFormat::Png);

        let error =
            validate_image_attachment(&config, &bytes).expect_err("wide image should be rejected");

        assert_eq!(
            error.to_string(),
            "bad request: image attachment width is too large"
        );
    }

    #[test]
    fn storage_key_path_rejects_traversal() {
        let error = attachment_storage_path("uploads", "../outside.png")
            .expect_err("traversal should be rejected");

        assert_eq!(
            error.to_string(),
            "bad request: attachment storage key is invalid"
        );
    }
}
