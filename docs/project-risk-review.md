# WFChat Project Risk Review

Date: 2026-07-02

This document summarizes issues found during a repository review of WFChat. It focuses on risks that can affect security, correctness, operations, maintainability, and production readiness.

## Executive Summary

WFChat is already stronger than a typical prototype. The project has a clear full-stack shape, a Rust Axum API, React/Vite frontend, PostgreSQL persistence, Docker runtime, image attachment validation, streaming chat, voice features, account sync, and a meaningful automated test suite.

The project is suitable for a serious MVP, personal production use, or a small beta. It is not yet hardened enough for a public production deployment without addressing the security and data consistency items below.

Estimated current quality split:

- Strengths: 78%
- Risks and gaps: 22%

If measured against a stricter public SaaS production bar:

- Strengths: 65%
- Risks and gaps: 35%

## Verification Snapshot

These checks passed during review:

- Frontend tests: 162 passed
- Backend tests: 91 passed
- Frontend production build: passed

Approximate source size excluding dependencies/build output:

- `apps/api`: 23 files, 8,436 lines
- `apps/web`: 84 files, 15,105 lines
- `docs`: 29 files, 4,258 lines
- `scripts`: 1 file, 61 lines

## Risk Levels

Severity definitions used in this review:

- Critical: can expose sensitive data, break account boundaries, corrupt data, or make production deployment unsafe.
- High: likely to cause serious production incidents, difficult recovery, or major user-facing failure.
- Medium: important technical debt or reliability issue that should be fixed before scaling.
- Low: cleanup, documentation drift, developer experience, or polish issues.

## Critical Risks

### 1. Session Model Is Weaker Than It Looks

Files:

- `apps/api/src/auth.rs`
- `apps/web/src/features/chat/services/chatApiService.ts`
- `apps/web/src/services/authService.ts`

The backend sets an `HttpOnly` cookie named `wfchat_session`, but most request ownership is resolved from the `X-WFChat-Session` header. The frontend stores this session id in browser storage and sends it on API calls.

This means the system does not get the full protection benefit of an `HttpOnly` cookie. If an XSS issue appears later, JavaScript can read the stored session id and impersonate that browser session.

Recommended fix:

- Prefer cookie-first auth on the backend.
- Parse `wfchat_session` from the cookie when the header is absent.
- Consider removing localStorage/session header usage for authenticated flows.
- If the header must stay for LAN/local compatibility, document it as a fallback and protect it carefully.
- Add `Secure` when running behind HTTPS.
- Consider `SameSite=Lax` or `Strict` depending on Google login and deployment needs.

Priority:

Fix before public deployment or before storing sensitive user data.

## High Risks

### 2. Database Errors Are Often Hidden

File:

- `apps/api/src/store.rs`

Several store operations ignore query results with `let _ = ...` or convert errors into `None`, `false`, or empty lists. This keeps the app from crashing in local development, but it makes production failures hard to detect.

Risk examples:

- Insert silently fails but the API returns optimistic data.
- A query fails and the UI receives an empty list, making real data look deleted.
- Operational issues become invisible until users report missing data.

Recommended fix:

- Make store methods return `Result<T, sqlx::Error>` or a domain-specific store error.
- Convert expected not-found cases explicitly.
- Log unexpected database errors with enough context.
- Avoid returning empty lists for failed queries unless that behavior is intentional and documented.

Priority:

Fix progressively, starting with chat writes, auth/session writes, attachments, and sync commits.

### 3. No Rate Limiting or Abuse Controls

Files:

- `apps/api/src/chat.rs`
- `apps/api/src/voice.rs`
- `apps/api/src/attachments.rs`

Endpoints that can create cost or load do not appear to have rate limits:

- Chat completion and streaming
- Text-to-speech
- Speech transcription
- Image upload

This is acceptable for local use, but risky for any public endpoint because provider costs and CPU/storage load can grow quickly.

Recommended fix:

- Add per-session and per-IP rate limits.
- Use stricter limits for speech, transcription, and upload.
- Add request size/time limits where missing.
- Return `429 Too Many Requests` with a simple error body.

Priority:

Fix before exposing the API publicly.

## Medium Risks

### 4. Migration System Is Ad Hoc

Files:

- `apps/api/db/init.sql`
- `apps/api/src/store.rs`

The project uses PostgreSQL, but schema management is split between `init.sql` and in-code migration SQL. This works for local development but becomes fragile as schema changes grow.

Recommended fix:

- Adopt `sqlx migrate` or another migration tool.
- Store migrations as ordered files.
- Run migrations during startup or deployment.
- Keep `init.sql` only as a bootstrap helper if needed.

Priority:

Fix before multiple deployed environments exist.

### 5. No CI Gate Found

Files:

- root repo, missing `.github/workflows/*`
- `package.json`
- `apps/web/package.json`
- `apps/api/Cargo.toml`

The repo has tests, but no root CI workflow was found. Without CI, test quality depends on local discipline.

Recommended fix:

- Add GitHub Actions or equivalent CI.
- Run:
  - `npm --prefix apps/web test`
  - `npm --prefix apps/web run build`
  - `cargo test --manifest-path apps/api/Cargo.toml`
  - `cargo fmt --check`
  - `cargo clippy --manifest-path apps/api/Cargo.toml -- -D warnings`

Priority:

Fix before accepting outside contributions or making larger changes.

### 6. No Frontend Lint/Format Gate

Files:

- `apps/web/package.json`

The frontend uses TypeScript strict mode and tests, which is good. However, no ESLint or Prettier scripts were found. This can allow style drift and common React mistakes to slip through.

Recommended fix:

- Add ESLint for React/TypeScript.
- Add Prettier or another formatter.
- Add `lint` and `format:check` scripts.
- Include them in CI.

Priority:

Medium for team development, low for solo work.

### 7. Sync Has Known Missing E2E Coverage

Files:

- `docs/sync-system.md`
- `apps/web/src/services/syncService.ts`
- `apps/api/src/sync.rs`

The sync system has unit and flow tests, but docs already note missing browser-level E2E coverage. Sync logic is easy to break because it spans local storage, remote ownership, account promotion, conflict handling, and offline behavior.

Recommended fix:

- Add Playwright tests for:
  - guest local changes
  - login promotion
  - sync across two browser contexts
  - delete propagation
  - conflict behavior

Priority:

Medium, especially before changing sync logic.

### 8. Profile Avatar URL Is Not Strictly Validated

Files:

- `apps/api/src/auth.rs`
- `apps/api/src/store.rs`

Profile update accepts `avatar_url` as free text and stores it after trimming. React will escape text in normal rendering, but image URL fields can still create privacy or tracking issues if arbitrary third-party URLs are displayed.

Recommended fix:

- Validate allowed URL schemes: `https`, maybe `http` only for local development.
- Consider disallowing `data:` and `javascript:` explicitly.
- Consider proxying or uploading avatars instead of hotlinking remote URLs.

Priority:

Medium if profiles are public or shared. Low if only local/personal.

## Low Risks

### 9. Bundle Size Should Be Watched

Files:

- `apps/web/vite.config.ts`
- `apps/web/src/features/chat/components/codeHighlighter.ts`

The Vite build passed and already splits Markdown/Shiki-related chunks. The main bundle is still something to monitor as features grow.

Recommended fix:

- Keep dynamic imports for syntax highlighting.
- Add bundle analysis periodically.
- Avoid moving Markdown/highlighting dependencies into the initial route if not needed.

Priority:

Low.

### 10. Test Output Contains Expected Error Logs

Files:

- `apps/web/src/features/chat/hooks/useUserSpeechTranscription.test.ts`

Frontend tests pass, but some tests intentionally log errors for microphone denial and transcription failure. This is not a functional issue, but it can make real test noise harder to spot.

Recommended fix:

- Mock `console.error` in tests that intentionally trigger errors.
- Assert that the expected log happened, then restore the console mock.

Priority:

Low.

### 11. Some Future/Scaffolded Providers Are Present

Files:

- `apps/api/src/ai/providers/anthropic.rs`
- `apps/api/src/config.rs`

Anthropic/Claude is scaffolded but not implemented, and config validation rejects it. This is acceptable, but the docs and UI should keep it clearly marked as unavailable.

Recommended fix:

- Keep startup failure explicit for unsupported providers.
- Do not expose unsupported provider choices in user-facing UI.
- Add implementation only when there is a tested adapter.

Priority:

Low.

## Existing Strengths Worth Preserving

### API Boundary

The frontend does not send provider names, model names, or API keys in normal chat requests. The backend owns provider selection. This is a good design and should be preserved.

### Attachment Safety

Image uploads validate type by bytes, enforce dimensions and pixel limits, reject SVG, and protect storage paths from traversal. This is one of the stronger areas of the codebase.

### Streaming Contract

SSE streaming has tests for token events, completion, error handling, and persistence. The frontend parser also handles split frames and CRLF normalization.

### Markdown Rendering Boundary

User messages render as plain text. Assistant messages render through a controlled Markdown renderer. Links use `target="_blank"` with `rel="noreferrer noopener"`.

### Tests

The number and focus of tests are strong for an MVP:

- backend config validation
- auth promotion
- chat streaming
- attachment ownership
- image validation
- voice providers
- frontend chat hooks
- sync flows
- Markdown rendering
- avatar runtime behavior

## Recommended Fix Order

### Phase 1: Public Deployment Blockers

1. Harden session handling and reduce reliance on browser-readable session ids.
2. Add rate limits to chat, voice, transcription, and upload endpoints.

### Phase 2: Reliability and Operations

1. Stop swallowing important database errors.
2. Adopt a migration system.
3. Add CI for tests, build, fmt, and clippy.
4. Add frontend lint/format checks.

### Phase 3: Maintainability and Polish

1. Add browser E2E tests for sync and auth flows.
2. Validate profile avatar URLs.
3. Clean expected error logs from test output.
4. Monitor frontend bundle size.

## Overall Assessment

WFChat has a better foundation than the phrase "vibe coding" suggests. The project already has real product structure, a reasonable backend boundary, meaningful tests, Docker runtime, and several security-conscious choices.

The main gap is not that the system is poorly built. The main gap is that it has not yet been hardened around production boundaries:

- session security
- rate limiting
- database error visibility
- migration and CI discipline

After those are addressed, this project can move from strong MVP quality toward production-ready quality.
