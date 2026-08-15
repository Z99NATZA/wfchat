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
pub(crate) enum AuthorizationAction {
    ReadAiProfiles,
    ReadProviderStatus,
}

impl AuthorizationAction {
    fn as_str(self) -> &'static str {
        match self {
            Self::ReadAiProfiles => "read_ai_profiles",
            Self::ReadProviderStatus => "read_provider_status",
        }
    }
}

#[derive(Clone, Copy, Debug)]
pub(crate) enum AuthorizationRejectionReason {
    MissingSession,
    InvalidSession,
    InsufficientRole,
}

impl AuthorizationRejectionReason {
    fn as_str(self) -> &'static str {
        match self {
            Self::MissingSession => "missing_session",
            Self::InvalidSession => "invalid_session",
            Self::InsufficientRole => "insufficient_role",
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

pub(crate) fn rejected(action: AuthorizationAction, reason: AuthorizationRejectionReason) {
    let context = current_context();
    if context.emitted.swap(true, Ordering::Relaxed) {
        return;
    }

    match context.request_id {
        Some(request_id) => tracing::warn!(
            target: "wfchat::authorization_security",
            event = "authorization_rejected",
            request_id = %request_id.value(),
            resource = "admin",
            action = action.as_str(),
            outcome = "rejected",
            status = StatusCode::FORBIDDEN.as_u16(),
            reason = reason.as_str(),
            "authorization rejected"
        ),
        None => tracing::warn!(
            target: "wfchat::authorization_security",
            event = "authorization_rejected",
            resource = "admin",
            action = action.as_str(),
            outcome = "rejected",
            status = StatusCode::FORBIDDEN.as_u16(),
            reason = reason.as_str(),
            "authorization rejected"
        ),
    }
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

    use axum::{body::Body, http::Request as HttpRequest, middleware, routing::get, Router};
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
                .filter(|event: &Value| event["target"] == "wfchat::authorization_security")
                .collect()
        }
    }

    fn test_app() -> Router {
        Router::new()
            .route(
                "/profiles/missing",
                get(|| async {
                    rejected(
                        AuthorizationAction::ReadAiProfiles,
                        AuthorizationRejectionReason::MissingSession,
                    );
                    rejected(
                        AuthorizationAction::ReadAiProfiles,
                        AuthorizationRejectionReason::MissingSession,
                    );
                    StatusCode::FORBIDDEN
                }),
            )
            .route(
                "/provider/invalid",
                get(|| async {
                    rejected(
                        AuthorizationAction::ReadProviderStatus,
                        AuthorizationRejectionReason::InvalidSession,
                    );
                    StatusCode::FORBIDDEN
                }),
            )
            .route(
                "/profiles/role",
                get(|| async {
                    rejected(
                        AuthorizationAction::ReadAiProfiles,
                        AuthorizationRejectionReason::InsufficientRole,
                    );
                    StatusCode::FORBIDDEN
                }),
            )
            .route("/provider/ok", get(|| async { StatusCode::OK }))
            .layer(middleware::from_fn(request_context))
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
            ("/profiles/missing", "read_ai_profiles", "missing_session"),
            (
                "/provider/invalid",
                "read_provider_status",
                "invalid_session",
            ),
            ("/profiles/role", "read_ai_profiles", "insufficient_role"),
        ];

        for (path, action, reason) in cases {
            let request_id = Uuid::new_v4();
            let (status, events) = capture(path, Some(request_id)).await;

            assert_eq!(status, StatusCode::FORBIDDEN);
            assert_eq!(events.len(), 1);
            let event = &events[0];
            assert_eq!(event["level"], "WARN");
            assert_eq!(event["event"], "authorization_rejected");
            assert_eq!(event["request_id"], request_id.to_string());
            assert_eq!(event["resource"], "admin");
            assert_eq!(event["action"], action);
            assert_eq!(event["outcome"], "rejected");
            assert_eq!(event["status"], 403);
            assert_eq!(event["reason"], reason);

            let encoded = serde_json::to_string(event).expect("event should serialize");
            assert!(!encoded.contains("secret-authorization-value"));
            assert!(!encoded.contains("secret-session-value"));
        }
    }

    #[tokio::test(flavor = "current_thread")]
    async fn omits_missing_request_id_and_does_not_log_success() {
        let (status, events) = capture("/profiles/missing", None).await;
        assert_eq!(status, StatusCode::FORBIDDEN);
        assert_eq!(events.len(), 1);
        assert!(events[0].get("request_id").is_none());

        let (status, events) = capture("/provider/ok", None).await;
        assert_eq!(status, StatusCode::OK);
        assert!(events.is_empty());
    }
}
