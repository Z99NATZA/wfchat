# Backend Auth Behavior History

## 2026-07-04 - Cookie-first session ownership

Status: Active

Previous behavior:

- The prior frontend stored the session id in browser-readable storage and sent
  it on normal API calls.

Problem observed:

- Browser-readable session ids reduced the security value of the HTTP-only
  cookie because future XSS issues could read and replay them.

Decision:

- Browser frontend requests rely on `withCredentials` / `credentials: include`.
- The backend reads `wfchat_session` first and uses `X-WFChat-Session` only as a
  compatibility fallback.
- `GET /api/auth/me` refreshes the session cookie for the resolved session, so
  the frontend can bootstrap cookie auth without storing a session id.
- Frontend session storage keeps only the non-secret
  `wfchat.sessionCookieReady` marker and removes legacy `wfchat.sessionId` from
  local storage when cookie auth is ready.
- Session cookies use `HttpOnly`, `SameSite=Lax`, and `Secure` when configured
  frontend origins include HTTPS.

Why:

- Cookie-first ownership keeps the session id out of browser-readable storage
  for normal authenticated flows while preserving compatibility for local or
  non-browser callers that still send the header.

Regression guard:

- Backend tests cover cookie-only auth, cookie-over-header precedence, header
  fallback parsing, cookie attributes, and logout cookie rotation.
- Frontend tests cover session cookie bootstrap and absence of session header
  assertions in normal chat/sync calls.

Related current contract:

- `docs/backend-architecture.md`
- `docs/frontend-architecture.md`
- `docs/sync-system.md`

Related implementation:

- `apps/api/src/session.rs`
- `apps/api/src/auth.rs`
- `apps/web/src/services/sessionService.ts`
