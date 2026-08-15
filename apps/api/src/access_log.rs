use std::{net::SocketAddr, time::Instant};

use axum::{
    body::HttpBody,
    extract::{ConnectInfo, MatchedPath, Request, State},
    http::{HeaderName, HeaderValue},
    middleware::Next,
    response::Response,
};
use ipnet::IpNet;
use uuid::Uuid;

use crate::{config::Config, rate_limit::client_ip_from_request};

const REQUEST_ID_HEADER: HeaderName = HeaderName::from_static("x-request-id");

#[derive(Clone, Debug)]
pub(crate) struct AccessLogConfig {
    trust_proxy_headers: bool,
    trusted_proxy_cidrs: Vec<IpNet>,
}

impl From<&Config> for AccessLogConfig {
    fn from(config: &Config) -> Self {
        Self {
            trust_proxy_headers: config.security.trust_proxy_headers,
            trusted_proxy_cidrs: config.security.trusted_proxy_cidrs.clone(),
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) struct RequestId(Uuid);

impl RequestId {
    pub(crate) fn value(self) -> Uuid {
        self.0
    }

    #[cfg(test)]
    pub(crate) fn from_uuid(value: Uuid) -> Self {
        Self(value)
    }
}

pub(crate) async fn log_http_request(
    State(config): State<AccessLogConfig>,
    ConnectInfo(peer_addr): ConnectInfo<SocketAddr>,
    mut request: Request,
    next: Next,
) -> Response {
    let started_at = Instant::now();
    let request_id = RequestId(Uuid::new_v4());
    let method = request.method().clone();
    let route = request
        .extensions()
        .get::<MatchedPath>()
        .map(|path| path.as_str().to_owned())
        .unwrap_or_else(|| "<unmatched>".to_owned());
    let source_ip = client_ip_from_request(
        request.headers(),
        peer_addr.ip(),
        config.trust_proxy_headers,
        &config.trusted_proxy_cidrs,
    );
    let request_bytes = request.body().size_hint().exact();
    request.extensions_mut().insert(request_id);

    let mut response = next.run(request).await;
    let status = response.status();
    let response_bytes = response.body().size_hint().exact();
    response.headers_mut().insert(
        REQUEST_ID_HEADER,
        HeaderValue::from_str(&request_id.value().to_string())
            .expect("UUID request id must be a valid header value"),
    );

    let outcome = match status.as_u16() {
        100..=399 => "success",
        400..=499 => "rejected",
        _ => "error",
    };
    let duration_ms = started_at.elapsed().as_millis() as u64;

    emit_http_access_log(HttpAccessLog {
        request_id,
        source_ip,
        method: method.as_str(),
        route: &route,
        status: status.as_u16(),
        duration_ms,
        request_bytes,
        response_bytes,
        outcome,
    });

    response
}

struct HttpAccessLog<'a> {
    request_id: RequestId,
    source_ip: std::net::IpAddr,
    method: &'a str,
    route: &'a str,
    status: u16,
    duration_ms: u64,
    request_bytes: Option<u64>,
    response_bytes: Option<u64>,
    outcome: &'a str,
}

macro_rules! emit_access_event {
    ($log:expr $(, $size_name:ident = $size_value:expr)*) => {
        tracing::info!(
            target: "wfchat::http_access",
            event = "http_access",
            request_id = %$log.request_id.value(),
            source_ip = %$log.source_ip,
            method = $log.method,
            route = $log.route,
            status = $log.status,
            duration_ms = $log.duration_ms,
            outcome = $log.outcome,
            $($size_name = $size_value,)*
            "http request completed"
        )
    };
}

fn emit_http_access_log(log: HttpAccessLog<'_>) {
    match (log.request_bytes, log.response_bytes) {
        (Some(request_bytes), Some(response_bytes)) => emit_access_event!(
            log,
            request_bytes = request_bytes,
            response_bytes = response_bytes
        ),
        (Some(request_bytes), None) => {
            emit_access_event!(log, request_bytes = request_bytes)
        }
        (None, Some(response_bytes)) => {
            emit_access_event!(log, response_bytes = response_bytes)
        }
        (None, None) => emit_access_event!(log),
    }
}

#[cfg(test)]
mod tests {
    use std::{
        io::{self, Write},
        sync::{Arc, Mutex},
    };

    use axum::{
        body::Body,
        http::{Request as HttpRequest, StatusCode},
        middleware,
        response::IntoResponse,
        routing::get,
        Extension, Router,
    };
    use serde_json::Value;
    use tower::ServiceExt;
    use tracing_subscriber::fmt::MakeWriter;

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

    fn test_app(config: AccessLogConfig) -> Router {
        Router::new()
            .route("/ok/{item_id}", get(|| async { "ok" }))
            .route(
                "/rejected",
                get(|| async { StatusCode::BAD_REQUEST.into_response() }),
            )
            .route(
                "/error",
                get(|| async { StatusCode::INTERNAL_SERVER_ERROR.into_response() }),
            )
            .layer(middleware::from_fn_with_state(config, log_http_request))
            .layer(Extension(ConnectInfo(
                "127.0.0.1:3000"
                    .parse::<SocketAddr>()
                    .expect("test peer address should parse"),
            )))
    }

    async fn capture_request(
        config: AccessLogConfig,
        request: HttpRequest<Body>,
    ) -> (axum::response::Response, Vec<Value>) {
        let writer = CapturedWriter::default();
        let subscriber = tracing_subscriber::fmt()
            .json()
            .flatten_event(true)
            .with_current_span(false)
            .with_span_list(false)
            .with_writer(writer.clone())
            .finish();
        let _guard = tracing::subscriber::set_default(subscriber);

        let response = test_app(config)
            .oneshot(request)
            .await
            .expect("request should run");

        (response, writer.events())
    }

    fn default_config() -> AccessLogConfig {
        AccessLogConfig {
            trust_proxy_headers: false,
            trusted_proxy_cidrs: Vec::new(),
        }
    }

    #[tokio::test(flavor = "current_thread")]
    async fn logs_normalized_route_and_server_generated_request_id_without_secrets() {
        let client_request_id = Uuid::new_v4();
        let request = HttpRequest::builder()
            .uri("/ok/secret-item-id?token=secret-query")
            .header("x-request-id", client_request_id.to_string())
            .header("cookie", "wfchat_session=secret-cookie")
            .header("authorization", "Bearer secret-token")
            .body(Body::from("secret-body"))
            .expect("request should build");

        let (response, events) = capture_request(default_config(), request).await;

        assert_eq!(response.status(), StatusCode::OK);
        let response_request_id = response
            .headers()
            .get(REQUEST_ID_HEADER)
            .expect("response should contain request id")
            .to_str()
            .expect("request id should be text");
        assert_ne!(response_request_id, client_request_id.to_string());
        Uuid::parse_str(response_request_id).expect("request id should be a UUID");

        let event = events
            .iter()
            .find(|event| event["event"] == "http_access")
            .expect("access event should be emitted");
        assert_eq!(event["request_id"], response_request_id);
        assert!(event["timestamp"].is_string());
        assert_eq!(event["level"], "INFO");
        assert_eq!(event["target"], "wfchat::http_access");
        assert_eq!(event["source_ip"], "127.0.0.1");
        assert_eq!(event["method"], "GET");
        assert_eq!(event["route"], "/ok/{item_id}");
        assert_eq!(event["status"], 200);
        assert_eq!(event["outcome"], "success");
        assert!(event["duration_ms"].is_number());
        assert_eq!(event["request_bytes"], 11);
        assert_eq!(event["response_bytes"], 2);

        let encoded = serde_json::to_string(&events).expect("events should serialize");
        let client_request_id = client_request_id.to_string();
        for secret in [
            "secret-item-id",
            "secret-query",
            "secret-cookie",
            "secret-token",
            "secret-body",
            client_request_id.as_str(),
        ] {
            assert!(!encoded.contains(secret), "log leaked {secret}");
        }
    }

    #[tokio::test(flavor = "current_thread")]
    async fn classifies_rejected_error_and_unmatched_responses() {
        for (path, status, outcome, route) in [
            ("/rejected", 400, "rejected", "/rejected"),
            ("/error", 500, "error", "/error"),
            ("/missing/private-id", 404, "rejected", "<unmatched>"),
        ] {
            let request = HttpRequest::get(path)
                .body(Body::empty())
                .expect("request should build");
            let (response, events) = capture_request(default_config(), request).await;

            assert_eq!(response.status().as_u16(), status);
            let event = events
                .iter()
                .find(|event| event["event"] == "http_access")
                .expect("access event should be emitted");
            assert_eq!(event["status"], status);
            assert_eq!(event["outcome"], outcome);
            assert_eq!(event["route"], route);
            assert!(!serde_json::to_string(event)
                .expect("event should serialize")
                .contains("private-id"));
        }
    }

    #[tokio::test(flavor = "current_thread")]
    async fn uses_the_shared_trusted_proxy_ip_resolution() {
        let config = AccessLogConfig {
            trust_proxy_headers: true,
            trusted_proxy_cidrs: vec!["127.0.0.0/8"
                .parse::<IpNet>()
                .expect("trusted CIDR should parse")],
        };
        let request = HttpRequest::get("/rejected")
            .header("x-forwarded-for", "203.0.113.20, 127.0.0.2")
            .body(Body::empty())
            .expect("request should build");

        let (_, events) = capture_request(config, request).await;

        let event = events
            .iter()
            .find(|event| event["event"] == "http_access")
            .expect("access event should be emitted");
        assert_eq!(event["source_ip"], "203.0.113.20");
    }
}
