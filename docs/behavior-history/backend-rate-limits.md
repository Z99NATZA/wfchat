# Backend Rate Limit Behavior History

## 2026-07-04 - Add cost-sensitive API rate limits

Status: Active

Previous behavior:
- Chat send/stream, assistant speech generation, user speech transcription, and
  image upload had validation and size limits, but no request-rate abuse
  controls.

Decision:
- Add an in-memory fixed-window limiter shared through `AppState`.
- Use session ids as the preferred bucket key.
- Fall back to client IP from `X-Forwarded-For` or `X-Real-IP` when no valid
  session header is available, then to an unknown-client bucket.
- Share one chat-message bucket across regular send and SSE streaming.
- Keep assistant speech, user transcription, and image upload in isolated
  stricter endpoint-family buckets.
- Return `429 Too Many Requests` through the normal JSON error boundary when a
  bucket is exceeded.

Why:
- These routes can create provider cost, CPU work, storage writes, or large
  request-body processing.
- Requests without a session header can otherwise create a new guest session per
  request and avoid session-only limiting.

Regression guard:
- `apps/api/src/rate_limit.rs` covers allowed requests, exceeded buckets,
  endpoint-family isolation, and IP fallback.
- `apps/api/src/chat.rs` covers route-level `429` behavior for chat
  send/stream, assistant speech, user transcription, and image upload.

Related current contract:
- `docs/backend-architecture.md`
- `docs/chat-sse-streaming.md`
- `docs/chat-voice.md`
- `docs/chat-image-attachments.md`

Related implementation:
- `apps/api/src/rate_limit.rs`
- `apps/api/src/chat.rs`
- `apps/api/src/error.rs`
- `apps/api/src/state.rs`
