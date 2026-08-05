use std::{
    io::Cursor,
    path::{Component, Path, PathBuf},
    sync::Arc,
    time::{Duration, SystemTime},
};

use image::{error::LimitErrorKind, ImageError, ImageReader, Limits};
use sha2::{Digest, Sha256};
use tokio::{fs, sync::Semaphore};
use uuid::Uuid;

use crate::{
    config::Config,
    error::{AppError, AppResult},
    store::ChatStore,
};

pub const CHAT_ATTACHMENT_KIND_IMAGE: &str = "image";
pub const ATTACHMENT_MULTIPART_OVERHEAD_BYTES: usize = 64 * 1024;
pub const PENDING_ATTACHMENT_CLEANUP_AFTER_SECONDS: u64 = 24 * 60 * 60;
pub const PENDING_ATTACHMENT_CLEANUP_INTERVAL_SECONDS: u64 = 60 * 60;
const PENDING_ATTACHMENT_CLEANUP_BATCH_SIZE: i64 = 100;
const ATTACHMENT_FILE_DELETION_BATCH_SIZE: i64 = 100;
const ATTACHMENT_FILE_RECONCILIATION_BATCH_SIZE: usize = 100;

#[derive(Default)]
pub(crate) struct AttachmentOrphanScan {
    entries: Option<fs::ReadDir>,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub(crate) struct AttachmentOrphanScanResult {
    pub inspected_entries: usize,
    pub enqueued_files: usize,
    pub reached_end: bool,
}

pub fn is_supported_chat_image_mime_type(mime_type: &str) -> bool {
    matches!(mime_type, "image/png" | "image/jpeg" | "image/webp")
}

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
}

#[derive(Clone, Debug)]
pub struct ImageDecodeLimiter {
    semaphore: Arc<Semaphore>,
}

impl ImageDecodeLimiter {
    pub fn new(max_concurrent_decodes: usize) -> Self {
        Self {
            semaphore: Arc::new(Semaphore::new(max_concurrent_decodes)),
        }
    }

    fn try_acquire(&self) -> AppResult<tokio::sync::OwnedSemaphorePermit> {
        self.semaphore
            .clone()
            .try_acquire_owned()
            .map_err(|_| AppError::RateLimited)
    }
}

#[derive(Clone, Copy, Debug)]
struct ImageValidationLimits {
    max_bytes: usize,
    max_width: u32,
    max_height: u32,
    max_pixels: u64,
    decoder_max_alloc_bytes: u64,
}

impl From<&Config> for ImageValidationLimits {
    fn from(config: &Config) -> Self {
        Self {
            max_bytes: config.chat_attachment_max_bytes,
            max_width: config.chat_attachment_max_width,
            max_height: config.chat_attachment_max_height,
            max_pixels: config.chat_attachment_max_pixels,
            decoder_max_alloc_bytes: config.chat_attachment_decoder_max_alloc_bytes,
        }
    }
}

impl SupportedImageFormat {
    fn mime_type(self) -> &'static str {
        match self {
            Self::Png => "image/png",
            Self::Jpeg => "image/jpeg",
            Self::Webp => "image/webp",
        }
    }

    fn extension(self) -> &'static str {
        match self {
            Self::Png => "png",
            Self::Jpeg => "jpg",
            Self::Webp => "webp",
        }
    }

    fn image_format(self) -> image::ImageFormat {
        match self {
            Self::Png => image::ImageFormat::Png,
            Self::Jpeg => image::ImageFormat::Jpeg,
            Self::Webp => image::ImageFormat::WebP,
        }
    }
}

pub async fn validate_image_attachment(
    config: &Config,
    decode_limiter: &ImageDecodeLimiter,
    bytes: Vec<u8>,
) -> AppResult<(ValidatedImageAttachment, Vec<u8>)> {
    let limits = ImageValidationLimits::from(config);
    let permit = decode_limiter.try_acquire()?;
    tokio::task::spawn_blocking(move || {
        let _permit = permit;
        let validated = validate_image_attachment_bytes(limits, &bytes)?;
        Ok((validated, bytes))
    })
    .await
    .map_err(|error| {
        tracing::error!(%error, "image attachment validation task failed");
        AppError::BadRequest("image attachment is not a valid image".to_owned())
    })?
}

fn validate_image_attachment_bytes(
    limits: ImageValidationLimits,
    bytes: &[u8],
) -> AppResult<ValidatedImageAttachment> {
    if bytes.is_empty() {
        return Err(AppError::BadRequest("image attachment is empty".to_owned()));
    }
    if bytes.len() > limits.max_bytes {
        return Err(AppError::BadRequest(
            "image attachment is too large".to_owned(),
        ));
    }

    let format = detect_supported_image_format(bytes)
        .ok_or_else(|| AppError::BadRequest("image attachment type is not supported".to_owned()))?;
    let mut dimensions_reader = ImageReader::with_format(Cursor::new(bytes), format.image_format());
    let mut dimension_limits = Limits::default();
    dimension_limits.max_image_width = None;
    dimension_limits.max_image_height = None;
    dimension_limits.max_alloc = Some(limits.decoder_max_alloc_bytes);
    dimensions_reader.limits(dimension_limits);
    let (width, height) = dimensions_reader
        .into_dimensions()
        .map_err(image_validation_error)?;
    let pixel_count = u64::from(width) * u64::from(height);

    if width == 0 || height == 0 {
        return Err(AppError::BadRequest(
            "image attachment dimensions are invalid".to_owned(),
        ));
    }
    if width > limits.max_width {
        return Err(AppError::BadRequest(
            "image attachment width is too large".to_owned(),
        ));
    }
    if height > limits.max_height {
        return Err(AppError::BadRequest(
            "image attachment height is too large".to_owned(),
        ));
    }
    if pixel_count > limits.max_pixels {
        return Err(AppError::BadRequest(
            "image attachment has too many pixels".to_owned(),
        ));
    }

    let mut decode_reader = ImageReader::with_format(Cursor::new(bytes), format.image_format());
    let mut decode_limits = Limits::default();
    decode_limits.max_image_width = Some(limits.max_width);
    decode_limits.max_image_height = Some(limits.max_height);
    decode_limits.max_alloc = Some(limits.decoder_max_alloc_bytes);
    decode_reader.limits(decode_limits);
    decode_reader.decode().map_err(image_validation_error)?;

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

pub async fn cleanup_stale_pending_chat_attachments(store: &ChatStore) -> usize {
    let stale_before = now_unix_seconds().saturating_sub(PENDING_ATTACHMENT_CLEANUP_AFTER_SECONDS);
    match store
        .delete_stale_pending_chat_attachments(
            CHAT_ATTACHMENT_KIND_IMAGE,
            stale_before,
            PENDING_ATTACHMENT_CLEANUP_BATCH_SIZE,
        )
        .await
    {
        Ok(count) => count as usize,
        Err(error) => {
            tracing::error!(%error, "failed to delete stale pending chat attachments");
            0
        }
    }
}

pub async fn process_chat_attachment_file_deletions(config: &Config, store: &ChatStore) -> usize {
    process_chat_attachment_file_deletions_batch(config, store, ATTACHMENT_FILE_DELETION_BATCH_SIZE)
        .await
}

async fn process_chat_attachment_file_deletions_batch(
    config: &Config,
    store: &ChatStore,
    limit: i64,
) -> usize {
    let deletions = match store.claim_chat_attachment_file_deletions(limit).await {
        Ok(deletions) => deletions,
        Err(error) => {
            tracing::error!(%error, "failed to claim chat attachment file deletions");
            return 0;
        }
    };
    let mut completed = 0;

    for deletion in deletions {
        match delete_attachment_file(&config.chat_attachment_upload_dir, &deletion.storage_key)
            .await
        {
            Ok(()) => match store
                .complete_chat_attachment_file_deletion(&deletion.storage_key, deletion.claim_token)
                .await
            {
                Ok(true) => completed += 1,
                Ok(false) => {
                    tracing::warn!(
                        storage_key = %deletion.storage_key,
                        "attachment file deletion claim changed before completion"
                    );
                }
                Err(error) => {
                    tracing::error!(
                        %error,
                        storage_key = %deletion.storage_key,
                        "failed to complete chat attachment file deletion"
                    );
                }
            },
            Err(error) => {
                tracing::warn!(
                    %error,
                    storage_key = %deletion.storage_key,
                    attempt_count = deletion.attempt_count,
                    byte_size = deletion.byte_size,
                    owner_session_id = ?deletion.owner_session_id,
                    owner_user_id = ?deletion.owner_user_id,
                    "failed to delete chat attachment file"
                );
                if let Err(retry_error) = store
                    .retry_chat_attachment_file_deletion(
                        &deletion.storage_key,
                        deletion.claim_token,
                    )
                    .await
                {
                    tracing::error!(
                        error = %retry_error,
                        storage_key = %deletion.storage_key,
                        "failed to retain chat attachment file deletion for retry"
                    );
                }
            }
        }
    }

    completed
}

impl AttachmentOrphanScan {
    pub(crate) async fn run(
        &mut self,
        config: &Config,
        store: &ChatStore,
    ) -> AttachmentOrphanScanResult {
        let stale_before = SystemTime::now()
            .checked_sub(Duration::from_secs(
                PENDING_ATTACHMENT_CLEANUP_AFTER_SECONDS,
            ))
            .unwrap_or(SystemTime::UNIX_EPOCH);
        self.run_before(config, store, stale_before).await
    }

    async fn run_before(
        &mut self,
        config: &Config,
        store: &ChatStore,
        stale_before: SystemTime,
    ) -> AttachmentOrphanScanResult {
        let chat_images_dir = Path::new(&config.chat_attachment_upload_dir).join("chat-images");
        if self.entries.is_none() {
            self.entries = match fs::read_dir(&chat_images_dir).await {
                Ok(entries) => Some(entries),
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                    return AttachmentOrphanScanResult {
                        reached_end: true,
                        ..Default::default()
                    };
                }
                Err(error) => {
                    tracing::error!(%error, path = %chat_images_dir.display(), "failed to scan chat image storage");
                    return AttachmentOrphanScanResult::default();
                }
            };
        }

        let mut result = AttachmentOrphanScanResult::default();
        while result.inspected_entries < ATTACHMENT_FILE_RECONCILIATION_BATCH_SIZE {
            let next_entry = self
                .entries
                .as_mut()
                .expect("attachment scan iterator should be open")
                .next_entry()
                .await;
            let entry = match next_entry {
                Ok(Some(entry)) => entry,
                Ok(None) => {
                    self.entries = None;
                    result.reached_end = true;
                    break;
                }
                Err(error) => {
                    tracing::warn!(%error, path = %chat_images_dir.display(), "failed to read chat image storage entry");
                    self.entries = None;
                    break;
                }
            };
            result.inspected_entries += 1;

            let Some(file_name) = entry.file_name().to_str().map(str::to_owned) else {
                continue;
            };
            if !is_strict_chat_image_file_name(&file_name) {
                continue;
            }
            match entry.file_type().await {
                Ok(file_type) if file_type.is_file() => {}
                Ok(_) => continue,
                Err(error) => {
                    tracing::warn!(%error, path = %entry.path().display(), "failed to inspect chat image storage entry type");
                    continue;
                }
            }
            let metadata = match entry.metadata().await {
                Ok(metadata) => metadata,
                Err(error) => {
                    tracing::warn!(%error, path = %entry.path().display(), "failed to inspect chat image storage entry");
                    continue;
                }
            };
            let Ok(modified_at) = metadata.modified() else {
                continue;
            };
            if modified_at >= stale_before {
                continue;
            }

            let Ok(byte_size) = i64::try_from(metadata.len()) else {
                tracing::warn!(path = %entry.path().display(), "chat image file size exceeds accounting range");
                continue;
            };
            let storage_key = format!("chat-images/{file_name}");
            match store
                .enqueue_reconciled_chat_attachment_file_deletion(&storage_key, byte_size)
                .await
            {
                Ok(true) => result.enqueued_files += 1,
                Ok(false) => {}
                Err(error) => {
                    tracing::error!(%error, %storage_key, "failed to enqueue orphaned chat image file");
                }
            }
        }

        result
    }
}

async fn delete_attachment_file(upload_dir: &str, storage_key: &str) -> std::io::Result<()> {
    let path = attachment_storage_path(upload_dir, storage_key).map_err(|error| {
        std::io::Error::new(std::io::ErrorKind::InvalidInput, error.to_string())
    })?;
    match fs::remove_file(path).await {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error),
    }
}

#[cfg(test)]
pub async fn remove_attachment_file(upload_dir: &str, storage_key: &str) {
    let _ = delete_attachment_file(upload_dir, storage_key).await;
}

fn is_strict_chat_image_file_name(file_name: &str) -> bool {
    let Some((id, extension)) = file_name.rsplit_once('.') else {
        return false;
    };
    if !matches!(extension, "png" | "jpg" | "webp") {
        return false;
    }

    Uuid::parse_str(id)
        .map(|parsed| parsed.hyphenated().to_string() == id)
        .unwrap_or(false)
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

fn image_validation_error(error: ImageError) -> AppError {
    match error {
        ImageError::Limits(error) if error.kind() == LimitErrorKind::InsufficientMemory => {
            AppError::BadRequest("image attachment exceeds decoder allocation limit".to_owned())
        }
        _ => AppError::BadRequest("image attachment is not a valid image".to_owned()),
    }
}

#[cfg(test)]
mod tests {
    use std::io::Cursor;

    use image::{DynamicImage, ImageBuffer, ImageFormat, Rgb};

    use super::*;

    async fn test_store() -> Option<ChatStore> {
        let database_url = std::env::var("WFCHAT_TEST_DATABASE_URL").ok()?;
        Some(
            ChatStore::connect(&database_url)
                .await
                .expect("WFCHAT_TEST_DATABASE_URL should identify a reachable test database"),
        )
    }

    fn temp_upload_dir() -> String {
        std::env::temp_dir()
            .join(format!("wfchat-attachment-maintenance-{}", Uuid::new_v4()))
            .to_string_lossy()
            .to_string()
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
            chat_attachment_decoder_max_alloc_bytes: 128 * 1024 * 1024,
            chat_attachment_max_concurrent_decodes: 2,
            chat_attachment_max_total_bytes_per_message: 20 * 1024 * 1024,
            security: Default::default(),
        }
    }

    fn validate(config: &Config, bytes: &[u8]) -> AppResult<ValidatedImageAttachment> {
        validate_image_attachment_bytes(ImageValidationLimits::from(config), bytes)
    }

    fn image_bytes(width: u32, height: u32, format: ImageFormat) -> Vec<u8> {
        let image = ImageBuffer::from_pixel(width, height, Rgb([1, 2, 3]));
        let mut bytes = Cursor::new(Vec::new());
        DynamicImage::ImageRgb8(image)
            .write_to(&mut bytes, format)
            .expect("test image should encode");
        bytes.into_inner()
    }

    fn corrupt_png_image_data(bytes: &mut [u8]) {
        let idat = bytes
            .windows(4)
            .position(|window| window == b"IDAT")
            .expect("encoded PNG should contain IDAT");
        bytes[idat + 4] ^= 0xff;
    }

    #[test]
    fn validate_image_attachment_accepts_png_bytes() {
        let config = test_config();
        let bytes = image_bytes(2, 3, ImageFormat::Png);

        let image = validate(&config, &bytes).expect("png should validate");

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

        let image = validate(&config, &bytes).expect("jpeg should validate");

        assert_eq!(image.mime_type, "image/jpeg");
        assert_eq!(image.extension, "jpg");
        assert_eq!(image.width, 2);
        assert_eq!(image.height, 3);
    }

    #[test]
    fn validate_image_attachment_accepts_webp_bytes() {
        let config = test_config();
        let bytes = image_bytes(2, 3, ImageFormat::WebP);

        let image = validate(&config, &bytes).expect("webp should validate");

        assert_eq!(image.mime_type, "image/webp");
        assert_eq!(image.extension, "webp");
        assert_eq!(image.width, 2);
        assert_eq!(image.height, 3);
    }

    #[test]
    fn validate_image_attachment_rejects_gif_bytes() {
        let config = test_config();
        let bytes = b"GIF89a\x01\x00\x01\x00\x80\x00\x00\x00\x00\x00\xff\xff\xff!\xf9\x04\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;";

        let error = validate(&config, bytes).expect_err("gif should be rejected");

        assert_eq!(
            error.to_string(),
            "bad request: image attachment type is not supported"
        );
    }

    #[test]
    fn validate_image_attachment_rejects_extensionless_svg_bytes() {
        let config = test_config();
        let bytes = br#"<svg xmlns="http://www.w3.org/2000/svg"></svg>"#;

        let error = validate(&config, bytes).expect_err("svg should be rejected");

        assert_eq!(
            error.to_string(),
            "bad request: image attachment type is not supported"
        );
    }

    #[test]
    fn validate_image_attachment_rejects_bad_magic_with_png_content_type_claim() {
        let config = test_config();
        let bytes = b"not actually a png";

        let error = validate(&config, bytes).expect_err("bad magic should be rejected");

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

        let error = validate(&config, &bytes).expect_err("wide image should be rejected");

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

    #[test]
    fn validate_image_attachment_rejects_dimensions_before_full_decode() {
        let mut config = test_config();
        config.chat_attachment_max_width = 1;
        let mut bytes = image_bytes(2, 1, ImageFormat::Png);
        corrupt_png_image_data(&mut bytes);

        let error = validate(&config, &bytes)
            .expect_err("oversized header should be rejected before truncated data is decoded");

        assert_eq!(
            error.to_string(),
            "bad request: image attachment width is too large"
        );
    }

    #[test]
    fn validate_image_attachment_rejects_pixel_count_before_full_decode() {
        let mut config = test_config();
        config.chat_attachment_max_pixels = 1;
        let mut bytes = image_bytes(2, 1, ImageFormat::Png);
        corrupt_png_image_data(&mut bytes);

        let error = validate(&config, &bytes)
            .expect_err("oversized header should be rejected before truncated data is decoded");

        assert_eq!(
            error.to_string(),
            "bad request: image attachment has too many pixels"
        );
    }

    #[test]
    fn validate_image_attachment_rejects_decoder_allocation_over_limit() {
        let mut config = test_config();
        config.chat_attachment_decoder_max_alloc_bytes = 1;
        let bytes = image_bytes(2, 2, ImageFormat::Png);

        let error = validate(&config, &bytes).expect_err("allocation limit should reject decode");

        assert_eq!(
            error.to_string(),
            "bad request: image attachment exceeds decoder allocation limit"
        );
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn decode_limiter_fails_fast_and_blocking_task_keeps_permit_after_abort() {
        let limiter = ImageDecodeLimiter::new(1);
        let permit = limiter.try_acquire().expect("first decode should acquire");
        let (started_tx, started_rx) = std::sync::mpsc::channel();
        let (release_tx, release_rx) = std::sync::mpsc::channel();
        let task = tokio::task::spawn_blocking(move || {
            let _permit = permit;
            started_tx.send(()).unwrap();
            release_rx.recv().unwrap();
        });
        started_rx.recv().unwrap();

        let error = validate_image_attachment(
            &test_config(),
            &limiter,
            image_bytes(1, 1, ImageFormat::Png),
        )
        .await
        .expect_err("decode should fail fast while capacity is full");
        assert!(matches!(error, AppError::RateLimited));
        task.abort();
        assert!(matches!(limiter.try_acquire(), Err(AppError::RateLimited)));

        release_tx.send(()).unwrap();
        let _ = task.await;
        tokio::task::yield_now().await;
        assert!(limiter.try_acquire().is_ok());
    }

    #[tokio::test]
    async fn deletion_worker_treats_missing_as_success_retains_failures_and_limits_batches() {
        let Some(store) = test_store().await else {
            return;
        };
        let mut config = test_config();
        config.chat_attachment_upload_dir = temp_upload_dir();

        let missing_key = format!("chat-images/{}.png", Uuid::new_v4());
        store
            .enqueue_reconciled_chat_attachment_file_deletion(&missing_key, 41)
            .await
            .unwrap();
        store
            .set_attachment_file_deletions_ready_for_test(std::slice::from_ref(&missing_key))
            .await
            .unwrap();
        assert_eq!(
            process_chat_attachment_file_deletions_batch(&config, &store, 1).await,
            1
        );
        assert_eq!(
            store
                .count_attachment_file_deletions_for_test(std::slice::from_ref(&missing_key))
                .await
                .unwrap(),
            0
        );

        let retry_key = format!("chat-images/{}.png", Uuid::new_v4());
        let retry_path = Path::new(&config.chat_attachment_upload_dir).join(&retry_key);
        fs::create_dir_all(&retry_path).await.unwrap();
        store
            .enqueue_reconciled_chat_attachment_file_deletion(&retry_key, 42)
            .await
            .unwrap();
        store
            .set_attachment_file_deletions_ready_for_test(std::slice::from_ref(&retry_key))
            .await
            .unwrap();
        process_chat_attachment_file_deletions_batch(&config, &store, 1).await;
        assert_eq!(
            store
                .count_attachment_file_deletions_for_test(std::slice::from_ref(&retry_key))
                .await
                .unwrap(),
            1,
            "filesystem failures must retain the durable record"
        );
        assert!(store
            .claim_chat_attachment_file_deletions(1)
            .await
            .unwrap()
            .iter()
            .all(|record| record.storage_key != retry_key));
        fs::remove_dir(&retry_path).await.unwrap();
        store
            .set_attachment_file_deletions_ready_for_test(std::slice::from_ref(&retry_key))
            .await
            .unwrap();
        process_chat_attachment_file_deletions_batch(&config, &store, 1).await;
        assert_eq!(
            store
                .count_attachment_file_deletions_for_test(std::slice::from_ref(&retry_key))
                .await
                .unwrap(),
            0
        );

        let bounded_keys = (0..101)
            .map(|_| format!("chat-images/{}.webp", Uuid::new_v4()))
            .collect::<Vec<_>>();
        for key in &bounded_keys {
            store
                .enqueue_reconciled_chat_attachment_file_deletion(key, 1)
                .await
                .unwrap();
        }
        store
            .set_attachment_file_deletions_ready_for_test(&bounded_keys)
            .await
            .unwrap();
        process_chat_attachment_file_deletions_batch(&config, &store, 100).await;
        assert_eq!(
            store
                .count_attachment_file_deletions_for_test(&bounded_keys)
                .await
                .unwrap(),
            1,
            "one maintenance run must process at most 100 deletion records"
        );
        store
            .delete_attachment_file_deletions_for_test(&bounded_keys)
            .await
            .unwrap();
        let _ = fs::remove_dir_all(&config.chat_attachment_upload_dir).await;
    }

    #[tokio::test]
    async fn reconciliation_requires_strict_old_unreferenced_files_and_is_bounded() {
        let Some(store) = test_store().await else {
            return;
        };
        let mut config = test_config();
        config.chat_attachment_upload_dir = temp_upload_dir();
        let chat_images_dir = Path::new(&config.chat_attachment_upload_dir).join("chat-images");
        fs::create_dir_all(&chat_images_dir).await.unwrap();

        let orphan_key = format!("chat-images/{}.jpg", Uuid::new_v4());
        fs::write(
            Path::new(&config.chat_attachment_upload_dir).join(&orphan_key),
            b"orphan",
        )
        .await
        .unwrap();
        fs::write(chat_images_dir.join("not-a-storage-key.png"), b"invalid")
            .await
            .unwrap();
        fs::create_dir(chat_images_dir.join(format!("{}.png", Uuid::new_v4())))
            .await
            .unwrap();

        let queued_key = format!("chat-images/{}.webp", Uuid::new_v4());
        fs::write(
            Path::new(&config.chat_attachment_upload_dir).join(&queued_key),
            b"queued",
        )
        .await
        .unwrap();
        store
            .enqueue_reconciled_chat_attachment_file_deletion(&queued_key, 6)
            .await
            .unwrap();

        let session = store.create_guest_session().await.unwrap();
        let owner = crate::store::OwnerScope::from_session(&session);
        let live_id = Uuid::new_v4();
        let live_key = image_storage_key(live_id, "png");
        fs::write(
            Path::new(&config.chat_attachment_upload_dir).join(&live_key),
            b"live",
        )
        .await
        .unwrap();
        store
            .create_chat_attachment(
                owner,
                crate::store::NewChatAttachmentRecord {
                    id: live_id,
                    kind: CHAT_ATTACHMENT_KIND_IMAGE.to_owned(),
                    mime_type: "image/png".to_owned(),
                    byte_size: 4,
                    width: Some(1),
                    height: Some(1),
                    sha256: "live".to_owned(),
                    storage_key: live_key.clone(),
                },
            )
            .await
            .unwrap();

        let mut scan = AttachmentOrphanScan::default();
        let fresh_result = scan
            .run_before(&config, &store, SystemTime::UNIX_EPOCH)
            .await;
        assert_eq!(fresh_result.inspected_entries, 5);
        assert_eq!(fresh_result.enqueued_files, 0);
        assert!(fresh_result.reached_end);

        let old_result = scan
            .run_before(&config, &store, SystemTime::now() + Duration::from_secs(1))
            .await;
        assert_eq!(old_result.inspected_entries, 5);
        assert_eq!(old_result.enqueued_files, 1);
        assert!(old_result.reached_end);
        assert_eq!(
            store
                .count_attachment_file_deletions_for_test(std::slice::from_ref(&orphan_key))
                .await
                .unwrap(),
            1
        );
        assert_eq!(
            store
                .count_attachment_file_deletions_for_test(std::slice::from_ref(&live_key))
                .await
                .unwrap(),
            0,
            "live attachment metadata excludes a file from reconciliation"
        );

        store
            .delete_attachment_file_deletions_for_test(&[orphan_key.clone(), queued_key])
            .await
            .unwrap();
        store
            .delete_pending_chat_attachment(owner, live_id)
            .await
            .unwrap();
        store.delete_session_for_test(session.id).await.unwrap();
        store
            .delete_attachment_file_deletions_for_test(std::slice::from_ref(&live_key))
            .await
            .unwrap();
        let _ = fs::remove_dir_all(&config.chat_attachment_upload_dir).await;

        let mut bounded_config = test_config();
        bounded_config.chat_attachment_upload_dir = temp_upload_dir();
        let bounded_dir = Path::new(&bounded_config.chat_attachment_upload_dir).join("chat-images");
        fs::create_dir_all(&bounded_dir).await.unwrap();
        let bounded_keys = (0..101)
            .map(|_| format!("chat-images/{}.png", Uuid::new_v4()))
            .collect::<Vec<_>>();
        for key in &bounded_keys {
            fs::write(
                Path::new(&bounded_config.chat_attachment_upload_dir).join(key),
                b"x",
            )
            .await
            .unwrap();
        }
        let mut bounded_scan = AttachmentOrphanScan::default();
        let first_batch = bounded_scan
            .run_before(
                &bounded_config,
                &store,
                SystemTime::now() + Duration::from_secs(1),
            )
            .await;
        assert_eq!(first_batch.inspected_entries, 100);
        assert_eq!(first_batch.enqueued_files, 100);
        assert!(!first_batch.reached_end);
        let second_batch = bounded_scan
            .run_before(
                &bounded_config,
                &store,
                SystemTime::now() + Duration::from_secs(1),
            )
            .await;
        assert_eq!(second_batch.inspected_entries, 1);
        assert_eq!(second_batch.enqueued_files, 1);
        assert!(second_batch.reached_end);
        assert_eq!(
            store
                .count_attachment_file_deletions_for_test(&bounded_keys)
                .await
                .unwrap(),
            101
        );
        store
            .delete_attachment_file_deletions_for_test(&bounded_keys)
            .await
            .unwrap();
        let _ = fs::remove_dir_all(&bounded_config.chat_attachment_upload_dir).await;
    }

    #[tokio::test]
    async fn reconciliation_scan_advances_past_blockers_and_resets_after_end() {
        let Some(store) = test_store().await else {
            return;
        };
        let mut config = test_config();
        config.chat_attachment_upload_dir = temp_upload_dir();
        let chat_images_dir = Path::new(&config.chat_attachment_upload_dir).join("chat-images");
        fs::create_dir_all(&chat_images_dir).await.unwrap();

        for index in 0..125 {
            fs::write(
                chat_images_dir.join(format!("blocker-{index:03}.txt")),
                b"x",
            )
            .await
            .unwrap();
        }
        let orphan_key = format!("chat-images/{}.png", Uuid::new_v4());
        fs::write(
            Path::new(&config.chat_attachment_upload_dir).join(&orphan_key),
            b"orphan",
        )
        .await
        .unwrap();

        let mut scan = AttachmentOrphanScan::default();
        let mut inspected_entries = 0;
        let mut enqueued_files = 0;
        let mut reached_end = false;
        for _ in 0..3 {
            let result = scan
                .run_before(&config, &store, SystemTime::now() + Duration::from_secs(1))
                .await;
            assert!(result.inspected_entries <= 100);
            inspected_entries += result.inspected_entries;
            enqueued_files += result.enqueued_files;
            if result.reached_end {
                reached_end = true;
                break;
            }
        }
        assert!(reached_end);
        assert_eq!(inspected_entries, 126);
        assert_eq!(enqueued_files, 1);
        assert_eq!(
            store
                .count_attachment_file_deletions_for_test(std::slice::from_ref(&orphan_key))
                .await
                .unwrap(),
            1
        );

        fs::remove_dir_all(&chat_images_dir).await.unwrap();
        fs::create_dir_all(&chat_images_dir).await.unwrap();
        let next_orphan_key = format!("chat-images/{}.jpg", Uuid::new_v4());
        fs::write(
            Path::new(&config.chat_attachment_upload_dir).join(&next_orphan_key),
            b"next",
        )
        .await
        .unwrap();
        let next_pass = scan
            .run_before(&config, &store, SystemTime::now() + Duration::from_secs(1))
            .await;
        assert_eq!(next_pass.inspected_entries, 1);
        assert_eq!(next_pass.enqueued_files, 1);
        assert!(next_pass.reached_end);

        store
            .delete_attachment_file_deletions_for_test(&[orphan_key, next_orphan_key])
            .await
            .unwrap();
        let _ = fs::remove_dir_all(&config.chat_attachment_upload_dir).await;
    }
}
