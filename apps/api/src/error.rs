use axum::{
    http::{header::RETRY_AFTER, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use serde::Serialize;

pub const LIMIT_RETRY_AFTER_SECONDS: u64 = 60;

#[derive(Clone, Copy, Debug, Serialize, Eq, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ErrorReason {
    ChatRequestRate,
    GenerationProcessCapacity,
    GenerationSessionCapacity,
    ChatGenerationActive,
    DailyQuotaLimit,
    GlobalDailyGenerationLimit,
    OwnerChatLimit,
    ChatStorageLimit,
    MessageSizeLimit,
    RequestSizeLimit,
    AssistantOutputSizeLimit,
    ImageSizeLimit,
    ImageCountLimit,
    ImageUploadRate,
    ImageProcessingCapacity,
    ImageStorageLimit,
}

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("not found")]
    NotFound,
    #[error("forbidden")]
    Forbidden,
    #[error("bad request: {0}")]
    BadRequest(String),
    #[error("payload too large")]
    PayloadTooLarge,
    #[error("conflict: {0}")]
    Conflict(String),
    #[error("upstream ai error: {0}")]
    Ai(String),
    #[error("database error")]
    Database,
    #[error("too many requests")]
    RateLimited,
    #[error("client disconnected")]
    ClientDisconnected,
    #[error("{message}")]
    Reasoned {
        status: StatusCode,
        message: String,
        reason: ErrorReason,
        retry_after_seconds: Option<u64>,
    },
}

#[derive(Serialize)]
struct ErrorBody {
    error: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    reason: Option<ErrorReason>,
    #[serde(skip_serializing_if = "Option::is_none")]
    retry_after_seconds: Option<u64>,
}

impl AppError {
    pub fn database(context: &'static str, error: sqlx::Error) -> Self {
        tracing::error!(context, error = %error, "database operation failed");
        AppError::Database
    }

    pub fn reasoned(
        status: StatusCode,
        message: impl Into<String>,
        reason: ErrorReason,
        retry_after_seconds: Option<u64>,
    ) -> Self {
        Self::Reasoned {
            status,
            message: message.into(),
            reason,
            retry_after_seconds,
        }
    }

    pub fn reason(&self) -> Option<ErrorReason> {
        match self {
            Self::Reasoned { reason, .. } => Some(*reason),
            _ => None,
        }
    }

    pub fn retry_after_seconds(&self) -> Option<u64> {
        match self {
            Self::RateLimited => Some(LIMIT_RETRY_AFTER_SECONDS),
            Self::Reasoned {
                retry_after_seconds,
                ..
            } => *retry_after_seconds,
            _ => None,
        }
    }

    fn body_retry_after_seconds(&self) -> Option<u64> {
        match self {
            Self::Reasoned {
                retry_after_seconds,
                ..
            } => *retry_after_seconds,
            _ => None,
        }
    }
}

impl From<sqlx::Error> for AppError {
    fn from(error: sqlx::Error) -> Self {
        AppError::database("database operation", error)
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let status = match &self {
            AppError::NotFound => StatusCode::NOT_FOUND,
            AppError::Forbidden => StatusCode::FORBIDDEN,
            AppError::BadRequest(_) => StatusCode::BAD_REQUEST,
            AppError::PayloadTooLarge => StatusCode::PAYLOAD_TOO_LARGE,
            AppError::Conflict(_) => StatusCode::CONFLICT,
            AppError::Ai(_) => StatusCode::BAD_GATEWAY,
            AppError::Database => StatusCode::INTERNAL_SERVER_ERROR,
            AppError::RateLimited => StatusCode::TOO_MANY_REQUESTS,
            AppError::ClientDisconnected => StatusCode::REQUEST_TIMEOUT,
            AppError::Reasoned { status, .. } => *status,
        };

        let body = Json(ErrorBody {
            error: match &self {
                AppError::Ai(_) => "assistant response failed".to_owned(),
                AppError::ClientDisconnected => "request canceled".to_owned(),
                _ => self.to_string(),
            },
            reason: self.reason(),
            retry_after_seconds: self.body_retry_after_seconds(),
        });
        let mut response = (status, body).into_response();
        if let Some(retry_after_seconds) = self.retry_after_seconds() {
            if let Ok(value) = HeaderValue::from_str(&retry_after_seconds.to_string()) {
                response.headers_mut().insert(RETRY_AFTER, value);
            }
        }
        response
    }
}

pub type AppResult<T> = Result<T, AppError>;
