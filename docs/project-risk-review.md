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

- Strengths: 70%
- Risks and gaps: 30%

## Verification Snapshot

These checks passed during review:

- Frontend tests: 164 passed
- Backend tests: 107 passed
- Frontend production build: passed

Approximate source size excluding dependencies/build output:

- `apps/api/src`: 24 files, 9,108 lines
- `apps/web/src`: 87 files, 15,483 lines
- `docs`: 39 files, 5,175 lines
- `scripts`: 1 file, 61 lines

## Risk Levels

Severity definitions used in this review:

- Critical: can expose sensitive data, break account boundaries, corrupt data, or make production deployment unsafe.
- High: likely to cause serious production incidents, difficult recovery, or major user-facing failure.
- Medium: important technical debt or reliability issue that should be fixed before scaling.
- Low: cleanup, documentation drift, developer experience, or polish issues.

## Critical Risks

No open critical risks are currently tracked in this review.

## Medium Risks

### 1. Migration System Is Ad Hoc

Status: addressed after this review.

Files:

- `apps/api/db/init.sql`
- `apps/api/src/store.rs`
- `apps/api/migrations/202607040001_initial_schema.sql`
- `docs/database-migrations.md`

The project previously used PostgreSQL schema management split between
`init.sql` and in-code migration SQL. This has been replaced by ordered SQLx
migrations under `apps/api/migrations/`, applied during API startup.

Follow-up:

- Keep migration files canonical.
- Add every future schema change as a new ordered migration.
- Keep `init.sql` as a legacy/manual bootstrap helper only if it remains useful.

Priority:

Done for the current schema. Continue following the operating rules in
`docs/database-migrations.md`.

### 2. CI Enforcement Depends on Branch Protection

Files:

- `.github/workflows/ci.yml`
- `package.json`
- `apps/web/package.json`
- `apps/api/Cargo.toml`

The repo now has a root GitHub Actions CI workflow for frontend tests, frontend
production build, backend tests, Rust formatting, and Rust clippy. The remaining
operational risk is making sure protected branches and deployment platforms
require this CI workflow to pass before merge or production deployment.

Recommended follow-up:

- Configure branch protection for the main branch.
- Require the CI workflow checks before merge.
- Gate any automatic deployment on successful CI.

Priority:

Basic CI is done. Enforce it before accepting outside contributions or enabling
automatic production deployment.

### 3. No Frontend Lint/Format Gate

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

### 4. Sync Still Needs Post-Hardening E2E Coverage

Files:

- `docs/sync-system.md`
- `apps/web/src/services/syncService.ts`
- `apps/api/src/sync.rs`
- `apps/web/e2e/sync-smoke.spec.ts`
- `apps/web/e2e/sync-guest-login.spec.ts`
- `apps/web/e2e/sync-cross-browser.spec.ts`

The sync system now has unit tests, flow tests, API coverage, and a Playwright
browser E2E suite for the first sync rollout. Covered browser flows include
guest-to-login manual sync, cross-browser pull, pulled settings/cache,
tombstone propagation, stale pulled settings, failed preview/commit retry
metadata, the browser `online` event, and cache fallback when persona list APIs
are unavailable.

The remaining risk is post-hardening coverage for behavior that is either not
implemented yet or intentionally limited. Sync logic is still easy to break
because it spans local storage, remote ownership, account promotion, conflict
handling, and offline behavior.

Recommended fix:

- Add post-hardening Playwright tests when the underlying behavior is designed:
  - deterministic cursor pagination for same-timestamp items
  - partial pull apply recovery
  - concurrent same-account same-item commits
  - mounted-state sync limitations
- Add API/integration coverage for Google login verification through a mockable
  verifier boundary.

Priority:

Medium before changing sync hardening or auth verification behavior. Lower for
ordinary UI work that does not touch sync/auth lifecycles.

### 5. Profile Avatar URL Is Not Strictly Validated

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

### 6. Bundle Size Should Be Watched

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

### 7. Test Output Contains Expected Warning Logs

Files:

- `apps/web/src/features/chat/hooks/useUserSpeechTranscription.test.ts`
- `apps/web/src/features/chat/hooks/useUserSpeechTranscription.ts`

Frontend tests pass, but some tests intentionally exercise microphone denial and
transcription failure paths. The hook logs expected warning output for
transcription failure. This is not a functional issue, but it can make real
test noise harder to spot.

Recommended fix:

- Mock `console.warn` in tests that intentionally trigger warning paths.
- Assert that the expected log happened, then restore the console mock.

Priority:

Low.

### 8. Some Future/Scaffolded Providers Are Present

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

### Phase 1: Reliability and Operations

1. Enforce CI through branch protection and deployment gates.
2. Add frontend lint/format checks.

### Phase 2: Maintainability and Polish

1. Add post-hardening browser E2E tests for sync edge cases when the underlying
   behavior is implemented.
2. Validate profile avatar URLs.
3. Clean expected warning/log noise from test output.
4. Monitor frontend bundle size.

## Overall Assessment

WFChat has a better foundation than the phrase "vibe coding" suggests. The project already has real product structure, a reasonable backend boundary, meaningful tests, Docker runtime, and several security-conscious choices.

The main gap is not that the system is poorly built. The main gap is that it still needs more production discipline around:

- migration and CI discipline
- post-hardening E2E coverage for sync/auth edge cases

After those are addressed, this project can move from strong MVP quality toward production-ready quality.
