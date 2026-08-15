use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};

use axum::{extract::Request, http::StatusCode, middleware::Next, response::Response};

use crate::access_log::RequestId;

#[derive(Clone)]
struct AuthorizationRequestContext {
    request_id: Option<RequestId>,
    emitted: Arc<AtomicBool>,
}

tokio::task_local! {
    static AUTHORIZATION_REQUEST_CONTEXT: AuthorizationRequestContext;
}

#[derive(Clone, Copy, Debug)]
pub(crate) enum AuthorizationResource {
    Admin,
    Chat,
    Attachment,
}

impl AuthorizationResource {
    fn as_str(self) -> &'static str {
        match self {
            Self::Admin => "admin",
            Self::Chat => "chat",
            Self::Attachment => "attachment",
        }
    }
}

#[derive(Clone, Copy, Debug)]
pub(crate) enum AuthorizationAction {
    ReadAiProfiles,
    ReadProviderStatus,
    ListChats,
    CreateChat,
    ReadChat,
    DeleteChat,
    ClearChatMessages,
    SendChatMessage,
    StreamChatMessage,
    UploadAttachment,
    PreviewAttachment,
    DeleteAttachment,
}

impl AuthorizationAction {
    fn as_str(self) -> &'static str {
        match self {
            Self::ReadAiProfiles => "read_ai_profiles",
            Self::ReadProviderStatus => "read_provider_status",
            Self::ListChats => "list_chats",
            Self::CreateChat => "create_chat",
            Self::ReadChat => "read_chat",
            Self::DeleteChat => "delete_chat",
            Self::ClearChatMessages => "clear_chat_messages",
            Self::SendChatMessage => "send_chat_message",
            Self::StreamChatMessage => "stream_chat_message",
            Self::UploadAttachment => "upload_attachment",
            Self::PreviewAttachment => "preview_attachment",
            Self::DeleteAttachment => "delete_attachment",
        }
    }
}

#[derive(Clone, Copy, Debug)]
pub(crate) enum AttachmentUploadRejectionReason {
    InvalidRequest,
    ImageSizeLimit,
    ImageUploadRate,
    ImageProcessingCapacity,
    ImageStorageLimit,
}

impl AttachmentUploadRejectionReason {
    fn as_str(self) -> &'static str {
        match self {
            Self::InvalidRequest => "invalid_request",
            Self::ImageSizeLimit => "image_size_limit",
            Self::ImageUploadRate => "image_upload_rate",
            Self::ImageProcessingCapacity => "image_processing_capacity",
            Self::ImageStorageLimit => "image_storage_limit",
        }
    }
}

#[derive(Clone, Copy, Debug)]
pub(crate) enum AuthorizationRejectionReason {
    MissingSession,
    InvalidSession,
    InsufficientRole,
    ResourceUnavailable,
}

impl AuthorizationRejectionReason {
    fn as_str(self) -> &'static str {
        match self {
            Self::MissingSession => "missing_session",
            Self::InvalidSession => "invalid_session",
            Self::InsufficientRole => "insufficient_role",
            Self::ResourceUnavailable => "resource_unavailable",
        }
    }
}

pub(crate) async fn request_context(request: Request, next: Next) -> Response {
    let context = AuthorizationRequestContext {
        request_id: request.extensions().get::<RequestId>().copied(),
        emitted: Arc::new(AtomicBool::new(false)),
    };
    AUTHORIZATION_REQUEST_CONTEXT
        .scope(context, next.run(request))
        .await
}

pub(crate) fn rejected(
    resource: AuthorizationResource,
    action: AuthorizationAction,
    status: StatusCode,
    reason: AuthorizationRejectionReason,
) {
    let context = current_context();
    if context.emitted.swap(true, Ordering::Relaxed) {
        return;
    }

    match context.request_id {
        Some(request_id) => tracing::warn!(
            target: "wfchat::authorization_security",
            event = "authorization_rejected",
            request_id = %request_id.value(),
            resource = resource.as_str(),
            action = action.as_str(),
            outcome = "rejected",
            status = status.as_u16(),
            reason = reason.as_str(),
            "authorization rejected"
        ),
        None => tracing::warn!(
            target: "wfchat::authorization_security",
            event = "authorization_rejected",
            resource = resource.as_str(),
            action = action.as_str(),
            outcome = "rejected",
            status = status.as_u16(),
            reason = reason.as_str(),
            "authorization rejected"
        ),
    }
}

pub(crate) fn attachment_upload_rejected(
    status: StatusCode,
    reason: AttachmentUploadRejectionReason,
) {
    let context = current_context();
    if context.emitted.swap(true, Ordering::Relaxed) {
        return;
    }

    match context.request_id {
        Some(request_id) => tracing::warn!(
            target: "wfchat::attachment_security",
            event = "attachment_upload_rejected",
            request_id = %request_id.value(),
            resource = "attachment",
            action = "upload_attachment",
            outcome = "rejected",
            status = status.as_u16(),
            reason = reason.as_str(),
            "attachment upload rejected"
        ),
        None => tracing::warn!(
            target: "wfchat::attachment_security",
            event = "attachment_upload_rejected",
            resource = "attachment",
            action = "upload_attachment",
            outcome = "rejected",
            status = status.as_u16(),
            reason = reason.as_str(),
            "attachment upload rejected"
        ),
    }
}

pub(crate) async fn attachment_body_limit_rejection(request: Request, next: Next) -> Response {
    let response = next.run(request).await;
    if response.status() == StatusCode::PAYLOAD_TOO_LARGE {
        attachment_upload_rejected(
            StatusCode::PAYLOAD_TOO_LARGE,
            AttachmentUploadRejectionReason::ImageSizeLimit,
        );
    }
    response
}

fn current_context() -> AuthorizationRequestContext {
    AUTHORIZATION_REQUEST_CONTEXT
        .try_with(Clone::clone)
        .unwrap_or_else(|_| AuthorizationRequestContext {
            request_id: None,
            emitted: Arc::new(AtomicBool::new(false)),
        })
}

#[cfg(test)]
mod tests {
    use std::{
        io::{self, Write},
        sync::{Arc, Mutex},
    };

    use axum::{
        body::Body, extract::Path, http::Request as HttpRequest, middleware, routing::get, Router,
    };
    use serde_json::Value;
    use tower::ServiceExt;
    use tracing_subscriber::fmt::MakeWriter;
    use uuid::Uuid;

    use super::*;

    #[derive(Clone, Default)]
    struct CapturedWriter(Arc<Mutex<Vec<u8>>>);

    impl Write for CapturedWriter {
        fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
            self.0.lock().expect("captured log lock").extend(bytes);
            Ok(bytes.len())
        }

        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }

    impl<'writer> MakeWriter<'writer> for CapturedWriter {
        type Writer = CapturedWriter;

        fn make_writer(&'writer self) -> Self::Writer {
            self.clone()
        }
    }

    impl CapturedWriter {
        fn events(&self) -> Vec<Value> {
            let output = self.0.lock().expect("captured log lock").clone();
            String::from_utf8(output)
                .expect("captured logs should be UTF-8")
                .lines()
                .map(|line| serde_json::from_str(line).expect("captured log should be JSON"))
                .filter(|event: &Value| {
                    matches!(
                        event["target"].as_str(),
                        Some("wfchat::authorization_security" | "wfchat::attachment_security")
                    )
                })
                .collect()
        }
    }

    fn test_app() -> Router {
        Router::new()
            .route(
                "/reject/{case}",
                get(|Path(case): Path<String>| async move {
                    let (resource, action, status, reason) = rejection_case(&case);
                    rejected(resource, action, status, reason);
                    rejected(resource, action, status, reason);
                    status
                }),
            )
            .route(
                "/upload/{case}",
                get(|Path(case): Path<String>| async move {
                    let (status, reason) = upload_rejection_case(&case);
                    attachment_upload_rejected(status, reason);
                    attachment_upload_rejected(status, reason);
                    status
                }),
            )
            .route(
                "/body-limit",
                get(|| async { StatusCode::PAYLOAD_TOO_LARGE })
                    .layer(middleware::from_fn(attachment_body_limit_rejection)),
            )
            .route("/ok", get(|| async { StatusCode::OK }))
            .route("/business-error", get(|| async { StatusCode::BAD_REQUEST }))
            .layer(middleware::from_fn(request_context))
    }

    fn rejection_case(
        case: &str,
    ) -> (
        AuthorizationResource,
        AuthorizationAction,
        StatusCode,
        AuthorizationRejectionReason,
    ) {
        match case {
            "admin_profiles" => (
                AuthorizationResource::Admin,
                AuthorizationAction::ReadAiProfiles,
                StatusCode::FORBIDDEN,
                AuthorizationRejectionReason::MissingSession,
            ),
            "admin_provider" => (
                AuthorizationResource::Admin,
                AuthorizationAction::ReadProviderStatus,
                StatusCode::FORBIDDEN,
                AuthorizationRejectionReason::InvalidSession,
            ),
            "admin_role" => (
                AuthorizationResource::Admin,
                AuthorizationAction::ReadAiProfiles,
                StatusCode::FORBIDDEN,
                AuthorizationRejectionReason::InsufficientRole,
            ),
            "list" => chat_case(AuthorizationAction::ListChats, StatusCode::FORBIDDEN),
            "list_missing" => (
                AuthorizationResource::Chat,
                AuthorizationAction::ListChats,
                StatusCode::FORBIDDEN,
                AuthorizationRejectionReason::MissingSession,
            ),
            "create" => chat_case(AuthorizationAction::CreateChat, StatusCode::FORBIDDEN),
            "read" => chat_case(AuthorizationAction::ReadChat, StatusCode::NOT_FOUND),
            "delete" => chat_case(AuthorizationAction::DeleteChat, StatusCode::NOT_FOUND),
            "clear" => chat_case(
                AuthorizationAction::ClearChatMessages,
                StatusCode::NOT_FOUND,
            ),
            "send" => chat_case(AuthorizationAction::SendChatMessage, StatusCode::NOT_FOUND),
            "stream" => chat_case(
                AuthorizationAction::StreamChatMessage,
                StatusCode::NOT_FOUND,
            ),
            "attachment_upload" => {
                attachment_case(AuthorizationAction::UploadAttachment, StatusCode::FORBIDDEN)
            }
            "attachment_preview" => attachment_case(
                AuthorizationAction::PreviewAttachment,
                StatusCode::NOT_FOUND,
            ),
            "attachment_delete" => {
                attachment_case(AuthorizationAction::DeleteAttachment, StatusCode::NOT_FOUND)
            }
            _ => panic!("unknown rejection case"),
        }
    }

    fn attachment_case(
        action: AuthorizationAction,
        status: StatusCode,
    ) -> (
        AuthorizationResource,
        AuthorizationAction,
        StatusCode,
        AuthorizationRejectionReason,
    ) {
        let reason = if status == StatusCode::NOT_FOUND {
            AuthorizationRejectionReason::ResourceUnavailable
        } else {
            AuthorizationRejectionReason::MissingSession
        };
        (AuthorizationResource::Attachment, action, status, reason)
    }

    fn upload_rejection_case(case: &str) -> (StatusCode, AttachmentUploadRejectionReason) {
        match case {
            "invalid" => (
                StatusCode::BAD_REQUEST,
                AttachmentUploadRejectionReason::InvalidRequest,
            ),
            "size" => (
                StatusCode::PAYLOAD_TOO_LARGE,
                AttachmentUploadRejectionReason::ImageSizeLimit,
            ),
            "rate" => (
                StatusCode::TOO_MANY_REQUESTS,
                AttachmentUploadRejectionReason::ImageUploadRate,
            ),
            "capacity" => (
                StatusCode::TOO_MANY_REQUESTS,
                AttachmentUploadRejectionReason::ImageProcessingCapacity,
            ),
            "storage" => (
                StatusCode::CONFLICT,
                AttachmentUploadRejectionReason::ImageStorageLimit,
            ),
            _ => panic!("unknown upload rejection case"),
        }
    }

    fn chat_case(
        action: AuthorizationAction,
        status: StatusCode,
    ) -> (
        AuthorizationResource,
        AuthorizationAction,
        StatusCode,
        AuthorizationRejectionReason,
    ) {
        let reason = if status == StatusCode::NOT_FOUND {
            AuthorizationRejectionReason::ResourceUnavailable
        } else {
            AuthorizationRejectionReason::InvalidSession
        };
        (AuthorizationResource::Chat, action, status, reason)
    }

    async fn capture(path: &str, request_id: Option<Uuid>) -> (StatusCode, Vec<Value>) {
        let writer = CapturedWriter::default();
        let subscriber = tracing_subscriber::fmt()
            .json()
            .flatten_event(true)
            .with_current_span(false)
            .with_span_list(false)
            .with_writer(writer.clone())
            .finish();
        let _guard = tracing::subscriber::set_default(subscriber);

        let mut request = HttpRequest::get(path)
            .header("authorization", "Bearer secret-authorization-value")
            .header("cookie", "wfchat_session=secret-session-value")
            .body(Body::empty())
            .expect("request should build");
        if let Some(request_id) = request_id {
            request
                .extensions_mut()
                .insert(RequestId::from_uuid(request_id));
        }

        let response = test_app()
            .oneshot(request)
            .await
            .expect("request should run");
        (response.status(), writer.events())
    }

    #[tokio::test(flavor = "current_thread")]
    async fn emits_bounded_correlated_rejections_once() {
        let cases = [
            (
                "/reject/admin_profiles",
                "admin",
                "read_ai_profiles",
                403,
                "missing_session",
            ),
            (
                "/reject/admin_provider",
                "admin",
                "read_provider_status",
                403,
                "invalid_session",
            ),
            (
                "/reject/admin_role",
                "admin",
                "read_ai_profiles",
                403,
                "insufficient_role",
            ),
            ("/reject/list", "chat", "list_chats", 403, "invalid_session"),
            (
                "/reject/list_missing",
                "chat",
                "list_chats",
                403,
                "missing_session",
            ),
            (
                "/reject/create",
                "chat",
                "create_chat",
                403,
                "invalid_session",
            ),
            (
                "/reject/read",
                "chat",
                "read_chat",
                404,
                "resource_unavailable",
            ),
            (
                "/reject/delete",
                "chat",
                "delete_chat",
                404,
                "resource_unavailable",
            ),
            (
                "/reject/clear",
                "chat",
                "clear_chat_messages",
                404,
                "resource_unavailable",
            ),
            (
                "/reject/send",
                "chat",
                "send_chat_message",
                404,
                "resource_unavailable",
            ),
            (
                "/reject/stream",
                "chat",
                "stream_chat_message",
                404,
                "resource_unavailable",
            ),
            (
                "/reject/attachment_upload",
                "attachment",
                "upload_attachment",
                403,
                "missing_session",
            ),
            (
                "/reject/attachment_preview",
                "attachment",
                "preview_attachment",
                404,
                "resource_unavailable",
            ),
            (
                "/reject/attachment_delete",
                "attachment",
                "delete_attachment",
                404,
                "resource_unavailable",
            ),
        ];

        for (path, resource, action, expected_status, reason) in cases {
            let request_id = Uuid::new_v4();
            let (status, events) = capture(path, Some(request_id)).await;

            assert_eq!(status.as_u16(), expected_status);
            assert_eq!(events.len(), 1);
            let event = &events[0];
            assert_eq!(event["level"], "WARN");
            assert_eq!(event["event"], "authorization_rejected");
            assert_eq!(event["request_id"], request_id.to_string());
            assert_eq!(event["resource"], resource);
            assert_eq!(event["action"], action);
            assert_eq!(event["outcome"], "rejected");
            assert_eq!(event["status"], expected_status);
            assert_eq!(event["reason"], reason);

            let encoded = serde_json::to_string(event).expect("event should serialize");
            assert!(!encoded.contains("secret-authorization-value"));
            assert!(!encoded.contains("secret-session-value"));
        }
    }

    #[tokio::test(flavor = "current_thread")]
    async fn emits_bounded_attachment_upload_rejections_and_body_limit_once() {
        let cases = [
            ("invalid", 400, "invalid_request"),
            ("size", 413, "image_size_limit"),
            ("rate", 429, "image_upload_rate"),
            ("capacity", 429, "image_processing_capacity"),
            ("storage", 409, "image_storage_limit"),
        ];

        for (case, expected_status, reason) in cases {
            let request_id = Uuid::new_v4();
            let (status, events) = capture(&format!("/upload/{case}"), Some(request_id)).await;
            assert_eq!(status.as_u16(), expected_status);
            assert_eq!(events.len(), 1);
            let event = &events[0];
            assert_eq!(event["level"], "WARN");
            assert_eq!(event["target"], "wfchat::attachment_security");
            assert_eq!(event["event"], "attachment_upload_rejected");
            assert_eq!(event["request_id"], request_id.to_string());
            assert_eq!(event["resource"], "attachment");
            assert_eq!(event["action"], "upload_attachment");
            assert_eq!(event["outcome"], "rejected");
            assert_eq!(event["status"], expected_status);
            assert_eq!(event["reason"], reason);

            let encoded = serde_json::to_string(event).unwrap();
            assert!(!encoded.contains("secret-authorization-value"));
            assert!(!encoded.contains("secret-session-value"));
        }

        let (status, events) = capture("/body-limit", None).await;
        assert_eq!(status, StatusCode::PAYLOAD_TOO_LARGE);
        assert_eq!(events.len(), 1);
        assert_eq!(events[0]["reason"], "image_size_limit");
        assert!(events[0].get("request_id").is_none());
    }

    #[tokio::test(flavor = "current_thread")]
    async fn omits_missing_request_id_and_does_not_log_success() {
        let (status, events) = capture("/reject/admin_profiles", None).await;
        assert_eq!(status, StatusCode::FORBIDDEN);
        assert_eq!(events.len(), 1);
        assert!(events[0].get("request_id").is_none());

        let (status, events) = capture("/ok", None).await;
        assert_eq!(status, StatusCode::OK);
        assert!(events.is_empty());

        let (status, events) = capture("/business-error", None).await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert!(events.is_empty());
    }
}
