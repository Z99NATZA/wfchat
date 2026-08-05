use axum::{
    http::{header::RETRY_AFTER, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use serde::Serialize;

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
}

#[derive(Serialize)]
struct ErrorBody {
    error: String,
}

impl AppError {
    pub fn database(context: &'static str, error: sqlx::Error) -> Self {
        tracing::error!(context, error = %error, "database operation failed");
        AppError::Database
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
        };

        let body = Json(ErrorBody {
            error: match &self {
                AppError::Ai(_) => "assistant response failed".to_owned(),
                AppError::ClientDisconnected => "request canceled".to_owned(),
                _ => self.to_string(),
            },
        });
        let mut response = (status, body).into_response();
        if matches!(self, AppError::RateLimited) {
            response
                .headers_mut()
                .insert(RETRY_AFTER, HeaderValue::from_static("60"));
        }
        response
    }
}

pub type AppResult<T> = Result<T, AppError>;
