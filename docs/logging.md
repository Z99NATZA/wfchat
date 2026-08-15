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

## Admin Authorization Rejection Events

The admin AI-profile and provider-status endpoints emit one additional
`authorization_rejected` event when their authorization check returns `403`.
Successful authorization does not emit this event. The event uses level `WARN`,
target `wfchat::authorization_security`, resource `admin`, outcome `rejected`,
and status `403`.

| Endpoint | Action |
| --- | --- |
| `GET /api/admin/ai-profiles` | `read_ai_profiles` |
| `GET /api/admin/ai-providers/status` | `read_provider_status` |

The reason is one of `missing_session`, `invalid_session`, or
`insufficient_role`. The server-generated `request_id` correlates the event
with its HTTP access event. If the request-id extension is unexpectedly absent,
the authorization event omits it without changing the response.

Authorization events do not record the client IP, session or user ids, roles,
tokens, cookies, headers, bodies, query values, raw paths, database details, or
raw error text. Unexpected `5xx` failures remain represented by HTTP access and
existing error logs. Other authorization scopes do not emit this event.

## Chat Authorization Rejection Events

Core Chat routes emit one `authorization_rejected` event for session or chat
access failures. The event uses level `WARN`, target
`wfchat::authorization_security`, resource `chat`, and outcome `rejected`.
Successful requests and business or operational rejections do not emit this
event.

| Route | Action |
| --- | --- |
| `GET /api/personas/{persona_id}/chats` | `list_chats` |
| `POST /api/personas/{persona_id}/chats` | `create_chat` |
| `GET /api/chats/{chat_id}` | `read_chat` |
| `DELETE /api/chats/{chat_id}` | `delete_chat` |
| `DELETE /api/chats/{chat_id}/messages` | `clear_chat_messages` |
| `POST /api/chats/{chat_id}/messages` | `send_chat_message` |
| `POST /api/chats/{chat_id}/messages/stream` | `stream_chat_message` |

Missing credentials and inactive sessions retain status `403` and use
`missing_session` and `invalid_session`. An active session requesting an
unavailable chat retains status `404` and uses `resource_unavailable`; this
does not disclose whether the chat is absent or owned by someone else.

These events follow the same request-id correlation, missing-request-id
behavior, single-event limit, and sensitive-data boundary as Admin
authorization events. They additionally exclude persona, chat, message, and
attachment identifiers and all chat text, prompts, AI output, and provider
payloads. Attachment, speech, transcription, memory, follow-up, and public Chat
configuration routes are outside this event scope.

## Attachment Security Events

Chat image upload, preview, and deletion extend `authorization_rejected` with
resource `attachment`. Upload uses action `upload_attachment`, preview uses
`preview_attachment`, and deletion uses `delete_attachment`. Missing or
inactive sessions retain `403` with `missing_session` or `invalid_session`.
Unavailable preview or deletion retains `404` with `resource_unavailable`
without revealing whether an attachment exists for another owner.

After upload authorization succeeds, validation and limit failures emit one
`attachment_upload_rejected` event at level `WARN` with target
`wfchat::attachment_security`, resource `attachment`, action
`upload_attachment`, and outcome `rejected`.

| Reason | Covered rejection |
| --- | --- |
| `invalid_request` | Missing/multiple file, malformed multipart, or invalid/unsupported image |
| `image_size_limit` | Request, byte, dimension, pixel, or decoder-allocation limit |
| `image_upload_rate` | Image-upload rate limit |
| `image_processing_capacity` | Image-processing concurrency limit |
| `image_storage_limit` | Per-owner attachment storage quota |

Attachment security events follow the existing request-id correlation,
missing-request-id behavior, and single-event limit. They exclude client IP,
all identifiers, filenames, MIME claims, hashes, dimensions, byte counts,
storage paths and keys, file bytes, multipart fields, headers, bodies, and raw
errors. Successful uploads, disabled routes, sent-attachment deletion
rejections, storage or database failures, and background attachment work do not
emit `attachment_upload_rejected`.

## Cafe Security Events

Cafe HTTP routes and the WebSocket handshake extend `authorization_rejected`
with resource `cafe`. Missing or inactive sessions retain `403` with
`missing_session` or `invalid_session`. An unavailable invite code retains
`404` with `resource_unavailable`, and an attempt to equip a locked cosmetic
retains `403` with `insufficient_entitlement`.

| Route | Action |
| --- | --- |
| `GET /api/cafe/rooms` | `list_cafe_rooms` |
| `POST /api/cafe/rooms` | `create_cafe_room` |
| `POST /api/cafe/rooms/quick-join` | `quick_join_cafe_room` |
| `POST /api/cafe/rooms/join` | `join_cafe_room` |
| `GET /api/cafe/progress` | `read_cafe_progress` |
| `POST /api/cafe/cosmetics/equipped` | `equip_cafe_cosmetic` |
| `GET /api/cafe/rooms/{room_id}/ws` | `connect_cafe_socket` |

The handshake and room-admission security controls emit
`cafe_request_rejected` at level `WARN`, target `wfchat::cafe_security`,
resource `cafe`, and outcome `rejected`.

| Reason | Status | Covered rejection |
| --- | ---: | --- |
| `origin_rejected` | `403` | WebSocket browser Origin is not allowlisted |
| `socket_capacity` | `429` | WebSocket session, IP, or global capacity is exhausted |
| `room_creation_rate` | `429` | Room creation admission limit is exhausted |

Origin is checked before session authorization and produces only the Cafe
security event. Room creation covers both explicit creation and quick join when
quick join must create a room. These events use the same request-id correlation,
missing-request-id behavior, and single-event limit as other authorization
events.

Cafe security events exclude client IP, all room, invite, session, user,
player, and cosmetic identifiers, nicknames, messages, coordinates, Origin
values, WebSocket frames, cookies, headers, bodies, query values, raw paths,
database details, and raw errors. Successful requests, malformed input,
invalid nickname or cosmetic values, room-full conflicts, successful room
reuse, missing WebSocket upgrade headers, database or operational failures,
and all events after the WebSocket upgrade do not emit these security events.
