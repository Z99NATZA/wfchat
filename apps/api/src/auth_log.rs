use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};

use axum::{
    extract::Request,
    http::{Method, StatusCode},
    middleware::Next,
    response::Response,
};

use crate::access_log::RequestId;

#[derive(Clone)]
struct AuthRequestContext {
    request_id: Option<RequestId>,
    emitted: Arc<AtomicBool>,
}

tokio::task_local! {
    static AUTH_REQUEST_CONTEXT: AuthRequestContext;
}

#[derive(Clone, Copy, Debug)]
pub(crate) enum AuthRejectionReason {
    InvalidRequest,
    MissingSession,
    InvalidSession,
    WrongSessionKind,
    ProviderRejected,
    NotConfigured,
    StateTransitionRejected,
}

impl AuthRejectionReason {
    fn as_str(self) -> &'static str {
        match self {
            Self::InvalidRequest => "invalid_request",
            Self::MissingSession => "missing_session",
            Self::InvalidSession => "invalid_session",
            Self::WrongSessionKind => "wrong_session_kind",
            Self::ProviderRejected => "provider_rejected",
            Self::NotConfigured => "not_configured",
            Self::StateTransitionRejected => "state_transition_rejected",
        }
    }
}

pub(crate) async fn request_context(request: Request, next: Next) -> Response {
    let method = request.method().clone();
    let path = request.uri().path().to_owned();
    let context = AuthRequestContext {
        request_id: request.extensions().get::<RequestId>().copied(),
        emitted: Arc::new(AtomicBool::new(false)),
    };
    let response = AUTH_REQUEST_CONTEXT
        .scope(context.clone(), next.run(request))
        .await;

    if !context.emitted.load(Ordering::Relaxed) && response.status().is_client_error() {
        let event = if method == Method::POST && path == "/auth/google" {
            Some("auth_login_rejected")
        } else if method == Method::PATCH && path == "/auth/profile" {
            Some("auth_profile_update_rejected")
        } else {
            None
        };
        if let Some(event) = event {
            emit_rejected(
                &context,
                event,
                response.status(),
                AuthRejectionReason::InvalidRequest,
            );
        }
    }

    response
}

pub(crate) fn guest_created(status: StatusCode) {
    emit_success("auth_guest_created", status);
}

pub(crate) fn login_succeeded(status: StatusCode) {
    emit_success("auth_login_succeeded", status);
}

pub(crate) fn login_rejected(status: StatusCode, reason: AuthRejectionReason) {
    let context = current_context();
    emit_rejected(&context, "auth_login_rejected", status, reason);
}

pub(crate) fn logout_succeeded(status: StatusCode) {
    emit_success("auth_logout_succeeded", status);
}

pub(crate) fn logout_rejected(status: StatusCode, reason: AuthRejectionReason) {
    let context = current_context();
    emit_rejected(&context, "auth_logout_rejected", status, reason);
}

pub(crate) fn profile_update_succeeded(status: StatusCode) {
    emit_success("auth_profile_update_succeeded", status);
}

pub(crate) fn profile_update_rejected(status: StatusCode, reason: AuthRejectionReason) {
    let context = current_context();
    emit_rejected(&context, "auth_profile_update_rejected", status, reason);
}

fn emit_success(event: &'static str, status: StatusCode) {
    let context = current_context();
    if context.emitted.swap(true, Ordering::Relaxed) {
        return;
    }
    match context.request_id {
        Some(request_id) => tracing::info!(
            target: "wfchat::auth_security",
            event,
            request_id = %request_id.value(),
            outcome = "success",
            status = status.as_u16(),
            "authentication lifecycle event"
        ),
        None => tracing::info!(
            target: "wfchat::auth_security",
            event,
            outcome = "success",
            status = status.as_u16(),
            "authentication lifecycle event"
        ),
    }
}

fn emit_rejected(
    context: &AuthRequestContext,
    event: &'static str,
    status: StatusCode,
    reason: AuthRejectionReason,
) {
    if context.emitted.swap(true, Ordering::Relaxed) {
        return;
    }
    match context.request_id {
        Some(request_id) => tracing::warn!(
            target: "wfchat::auth_security",
            event,
            request_id = %request_id.value(),
            outcome = "rejected",
            status = status.as_u16(),
            reason = reason.as_str(),
            "authentication lifecycle event"
        ),
        None => tracing::warn!(
            target: "wfchat::auth_security",
            event,
            outcome = "rejected",
            status = status.as_u16(),
            reason = reason.as_str(),
            "authentication lifecycle event"
        ),
    }
}

fn current_context() -> AuthRequestContext {
    AUTH_REQUEST_CONTEXT
        .try_with(Clone::clone)
        .unwrap_or_else(|_| AuthRequestContext {
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
        body::Body,
        http::Request as HttpRequest,
        middleware,
        routing::{patch, post},
        Json, Router,
    };
    use serde::Deserialize;
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
                .collect()
        }
    }

    #[derive(Deserialize)]
    struct LoginPayload {
        action: String,
    }

    fn test_app() -> Router {
        Router::new()
            .route(
                "/auth/guest",
                post(|| async {
                    guest_created(StatusCode::OK);
                    StatusCode::OK
                }),
            )
            .route(
                "/auth/google",
                post(|Json(payload): Json<LoginPayload>| async move {
                    match payload.action.as_str() {
                        "success" => {
                            login_succeeded(StatusCode::OK);
                            StatusCode::OK
                        }
                        _ => {
                            login_rejected(
                                StatusCode::FORBIDDEN,
                                AuthRejectionReason::InvalidSession,
                            );
                            StatusCode::FORBIDDEN
                        }
                    }
                }),
            )
            .route(
                "/auth/logout",
                post(|request: Request| async move {
                    if request.headers().contains_key("x-test-success") {
                        logout_succeeded(StatusCode::OK);
                        StatusCode::OK
                    } else {
                        logout_rejected(StatusCode::FORBIDDEN, AuthRejectionReason::MissingSession);
                        StatusCode::FORBIDDEN
                    }
                }),
            )
            .route(
                "/auth/profile",
                patch(|Json(payload): Json<LoginPayload>| async move {
                    match payload.action.as_str() {
                        "success" => {
                            profile_update_succeeded(StatusCode::OK);
                            profile_update_succeeded(StatusCode::OK);
                            StatusCode::OK
                        }
                        "missing" => {
                            profile_update_rejected(
                                StatusCode::FORBIDDEN,
                                AuthRejectionReason::MissingSession,
                            );
                            profile_update_rejected(
                                StatusCode::FORBIDDEN,
                                AuthRejectionReason::MissingSession,
                            );
                            StatusCode::FORBIDDEN
                        }
                        "invalid" => {
                            profile_update_rejected(
                                StatusCode::FORBIDDEN,
                                AuthRejectionReason::InvalidSession,
                            );
                            StatusCode::FORBIDDEN
                        }
                        "guest" => {
                            profile_update_rejected(
                                StatusCode::FORBIDDEN,
                                AuthRejectionReason::WrongSessionKind,
                            );
                            StatusCode::FORBIDDEN
                        }
                        "error" => StatusCode::INTERNAL_SERVER_ERROR,
                        _ => StatusCode::BAD_REQUEST,
                    }
                }),
            )
            .layer(middleware::from_fn(request_context))
    }

    async fn capture_request(request: HttpRequest<Body>) -> (StatusCode, Vec<Value>) {
        let writer = CapturedWriter::default();
        let subscriber = tracing_subscriber::fmt()
            .json()
            .flatten_event(true)
            .with_current_span(false)
            .with_span_list(false)
            .with_writer(writer.clone())
            .finish();
        let _guard = tracing::subscriber::set_default(subscriber);

        let response = test_app()
            .oneshot(request)
            .await
            .expect("request should run");
        let events = writer
            .events()
            .into_iter()
            .filter(|event| event["target"] == "wfchat::auth_security")
            .collect();
        (response.status(), events)
    }

    fn request(path: &str, body: &str, request_id: Option<Uuid>) -> HttpRequest<Body> {
        let mut request = HttpRequest::post(path)
            .header("content-type", "application/json")
            .header("authorization", "Bearer secret-auth-value")
            .header("cookie", "wfchat_session=secret-session-value")
            .body(Body::from(body.to_owned()))
            .expect("request should build");
        if let Some(request_id) = request_id {
            request
                .extensions_mut()
                .insert(RequestId::from_uuid(request_id));
        }
        request
    }

    #[tokio::test(flavor = "current_thread")]
    async fn emits_bounded_correlated_success_and_rejection_events_once() {
        let cases = [
            (
                "/auth/guest",
                "{}",
                "auth_guest_created",
                200,
                "success",
                None,
            ),
            (
                "/auth/google",
                r#"{"action":"success","id_token":"secret-google-token"}"#,
                "auth_login_succeeded",
                200,
                "success",
                None,
            ),
            (
                "/auth/google",
                r#"{"action":"reject","id_token":"secret-google-token"}"#,
                "auth_login_rejected",
                403,
                "rejected",
                Some("invalid_session"),
            ),
            (
                "/auth/logout",
                "{}",
                "auth_logout_rejected",
                403,
                "rejected",
                Some("missing_session"),
            ),
        ];

        for (path, body, event_name, status, outcome, reason) in cases {
            let request_id = Uuid::new_v4();
            let (actual_status, events) =
                capture_request(request(path, body, Some(request_id))).await;

            assert_eq!(actual_status.as_u16(), status);
            assert_eq!(events.len(), 1);
            let event = &events[0];
            assert_eq!(event["event"], event_name);
            assert_eq!(event["request_id"], request_id.to_string());
            assert_eq!(event["outcome"], outcome);
            assert_eq!(event["status"], status);
            assert_eq!(event.get("reason").and_then(Value::as_str), reason);
            assert_eq!(event["level"], if status == 200 { "INFO" } else { "WARN" });

            let encoded = serde_json::to_string(event).expect("event should serialize");
            for secret in [
                "secret-auth-value",
                "secret-session-value",
                "secret-google-token",
            ] {
                assert!(!encoded.contains(secret), "log leaked {secret}");
            }
        }

        let request_id = Uuid::new_v4();
        let mut logout_success = request("/auth/logout", "{}", Some(request_id));
        logout_success
            .headers_mut()
            .insert("x-test-success", "true".parse().unwrap());
        let (status, events) = capture_request(logout_success).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(events.len(), 1);
        assert_eq!(events[0]["event"], "auth_logout_succeeded");
        assert_eq!(events[0]["request_id"], request_id.to_string());
        assert!(events[0].get("reason").is_none());
    }

    #[tokio::test(flavor = "current_thread")]
    async fn malformed_login_is_rejected_once_and_missing_request_id_is_omitted() {
        let (status, events) = capture_request(request(
            "/auth/google",
            r#"{"action":"secret-malformed""#,
            None,
        ))
        .await;

        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(events.len(), 1);
        let event = &events[0];
        assert_eq!(event["event"], "auth_login_rejected");
        assert_eq!(event["outcome"], "rejected");
        assert_eq!(event["status"], 400);
        assert_eq!(event["reason"], "invalid_request");
        assert!(event.get("request_id").is_none());
        assert!(!serde_json::to_string(event)
            .expect("event should serialize")
            .contains("secret-malformed"));
    }

    #[tokio::test(flavor = "current_thread")]
    async fn emits_bounded_profile_update_events_once() {
        let cases = [
            (
                "success",
                "auth_profile_update_succeeded",
                200,
                "success",
                None,
            ),
            (
                "missing",
                "auth_profile_update_rejected",
                403,
                "rejected",
                Some("missing_session"),
            ),
            (
                "invalid",
                "auth_profile_update_rejected",
                403,
                "rejected",
                Some("invalid_session"),
            ),
            (
                "guest",
                "auth_profile_update_rejected",
                403,
                "rejected",
                Some("wrong_session_kind"),
            ),
            (
                "bad-profile-input",
                "auth_profile_update_rejected",
                400,
                "rejected",
                Some("invalid_request"),
            ),
        ];

        for (action, event_name, status, outcome, reason) in cases {
            let request_id = Uuid::new_v4();
            let request = HttpRequest::patch("/auth/profile")
                .header("content-type", "application/json")
                .header("authorization", "Bearer secret-profile-token")
                .header("cookie", "wfchat_session=secret-profile-session")
                .body(Body::from(format!(
                    r#"{{"action":"{action}","display_name":"secret-profile-name"}}"#
                )))
                .expect("request should build");
            let mut request = request;
            request
                .extensions_mut()
                .insert(RequestId::from_uuid(request_id));

            let (actual_status, events) = capture_request(request).await;
            assert_eq!(actual_status.as_u16(), status);
            assert_eq!(events.len(), 1);
            let event = &events[0];
            assert_eq!(event["event"], event_name);
            assert_eq!(event["request_id"], request_id.to_string());
            assert_eq!(event["outcome"], outcome);
            assert_eq!(event["status"], status);
            assert_eq!(event.get("reason").and_then(Value::as_str), reason);
            assert_eq!(event["level"], if status == 200 { "INFO" } else { "WARN" });

            let encoded = serde_json::to_string(event).expect("event should serialize");
            for secret in [
                "secret-profile-token",
                "secret-profile-session",
                "secret-profile-name",
            ] {
                assert!(!encoded.contains(secret), "log leaked {secret}");
            }
        }
    }

    #[tokio::test(flavor = "current_thread")]
    async fn malformed_profile_is_rejected_without_request_id_and_server_error_is_not_logged() {
        let malformed = HttpRequest::patch("/auth/profile")
            .header("content-type", "application/json")
            .body(Body::from(r#"{"action":"secret-profile-malformed""#))
            .expect("request should build");
        let (status, events) = capture_request(malformed).await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        assert_eq!(events.len(), 1);
        assert_eq!(events[0]["event"], "auth_profile_update_rejected");
        assert_eq!(events[0]["reason"], "invalid_request");
        assert!(events[0].get("request_id").is_none());
        assert!(!serde_json::to_string(&events[0])
            .expect("event should serialize")
            .contains("secret-profile-malformed"));

        let server_error = HttpRequest::patch("/auth/profile")
            .header("content-type", "application/json")
            .body(Body::from(r#"{"action":"error"}"#))
            .expect("request should build");
        let (status, events) = capture_request(server_error).await;
        assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
        assert!(events.is_empty());
    }
}
