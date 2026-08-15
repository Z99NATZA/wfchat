# Logging

The Rust API emits newline-delimited structured JSON to standard output in
every environment. Docker captures the API container's output; inspect it with
`docker compose logs api`. The application does not write log files or manage
rotation, retention, or external log storage.

## HTTP Access Events

One `http_access` event is emitted after every API response. The server creates
a new UUID v4 for each request, ignores a client-supplied `X-Request-ID`, uses
the generated value in the event, and returns it in the `X-Request-ID` response
header.

| Field            | Meaning                                                    |
| ---------------- | ---------------------------------------------------------- |
| `timestamp`      | UTC event time added by the JSON subscriber                |
| `level`          | `INFO` for HTTP access events                              |
| `target`         | `wfchat::http_access`                                      |
| `event`          | `http_access`                                              |
| `request_id`     | Server-generated request correlation UUID                  |
| `source_ip`      | Resolved client IP                                         |
| `method`         | HTTP method                                                |
| `route`          | Matched route template, or `<unmatched>`                   |
| `status`         | HTTP response status                                       |
| `duration_ms`    | Request duration in whole milliseconds                     |
| `request_bytes`  | Exact request body size when the body size hint provides it |
| `response_bytes` | Exact response body size when the body size hint provides it |
| `outcome`        | `success`, `rejected`, or `error`                          |

Unavailable size fields are omitted. Statuses from 100 through 399 are
`success`, 400 through 499 are `rejected`, and 500 through 599 are `error`.
Concrete identifiers and query values are excluded by recording the Axum route
template. Requests without a matched route use `<unmatched>` instead of the raw
path.

Client IP resolution uses the same trusted-proxy boundary as abuse controls.
The socket peer is used unless proxy headers are enabled, the peer belongs to a
configured trusted CIDR, and the single `X-Forwarded-For` chain is valid.

## Sensitive Data Boundary

Access events do not record request or response bodies, raw paths, query
values, cookies, authorization values, provider tokens, session or user ids,
chat content, or arbitrary headers. The request id is correlation metadata and
is never an authentication or authorization credential.

Authentication lifecycle events and Chat, Cafe, attachment, sync, memory, and
admin business events are outside the HTTP access event. Existing subsystem
events continue through the same JSON stdout subscriber.

## Authentication Lifecycle Events

Authentication state changes emit a second event correlated to the HTTP access
event by `request_id`. These events use target `wfchat::auth_security` and do
not repeat the client IP. If the request-id extension is unexpectedly absent,
the event is still emitted without that field and the response is unchanged.

| Event | Level | Outcome | When emitted |
| --- | --- | --- | --- |
| `auth_guest_created` | `INFO` | `success` | Explicit Guest creation or `/api/auth/me` creating a Guest |
| `auth_login_succeeded` | `INFO` | `success` | Google login and session rotation complete |
| `auth_login_rejected` | `WARN` | `rejected` | A Google login request is rejected with `4xx` |
| `auth_logout_succeeded` | `INFO` | `success` | Registered or admin session rotation to Guest completes |
| `auth_logout_rejected` | `WARN` | `rejected` | Logout lacks a session or cannot rotate it |

Every event has `event`, `outcome`, and `status`; `request_id` is present when
the access middleware supplied it. Successful events omit `reason`. Rejected
events use only `invalid_request`, `missing_session`, `invalid_session`,
`wrong_session_kind`, `provider_rejected`, `not_configured`, or
`state_transition_rejected`. Unexpected `5xx` results remain represented by
the HTTP access and existing error logs rather than an authentication lifecycle
event.

Guest admission rejection and `/api/auth/me` resolving an existing session do
not emit authentication events. Authentication events exclude session and user
ids, Google identity/profile values, tokens, cookies, headers, bodies, provider
payloads, and raw error text.
