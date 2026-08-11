# Agent Work Priority

Use this file as the first document to read before starting a new scoped agent task.

## Active Scope

Add one CI-owned Aiko Cafe full-stack smoke through the real Web, API,
PostgreSQL, and WebSocket stack. Limit the change to the existing Playwright
smoke job and its current-behavior documentation; exclude broader Cafe UI
coverage, load testing, protocol changes, and production behavior changes.

## Required Read Order

1. `docs/agent-work-priority.md`
2. `docs/ci.md`
3. `docs/aiko-cafe.md`
4. `apps/web/e2e/full-stack-smoke.spec.ts`
5. `apps/web/playwright.smoke.config.ts`
6. `.github/workflows/ci.yml`

## Required Outcome

Extend the existing full-stack smoke suite with a deterministic Cafe path that
creates a room, receives a real WebSocket welcome, reloads the same room, and
receives a fresh welcome on a replacement connection. Do not mock Cafe HTTP or
WebSocket traffic. Keep the existing guest-chat smoke intact, use the disposable
E2E database and Playwright-owned servers, and update CI documentation and job
wording where needed. Focused verification runs the smoke suite and formatting
or lint checks relevant to changed files.

## Authorization And Verification

- Repository changes require the applicable standalone authorization command:
  `ok impl`, `ok refine`, `ok fix`, or `ok update`. Use the clearly agreed scope;
  if it is missing or ambiguous, ask for clarification. Without the applicable
  command, repository work is read-only, and other wording does not grant
  authorization.
- `ok impl`, `ok refine`, and `ok fix` include focused tests and fixes for
  failures caused by the authorized changes.
- Do not run full checks by default. `ok tests` permits, but does not require,
  running any local test suites. `ok ci` likewise permits any local equivalents
  in `.github/workflows/ci.yml`. Neither command authorizes repository changes.
- Reuse valid results. Do not weaken assertions or fix unrelated behavior.
  Report unrelated, pre-existing, skipped, or blocked checks with their reasons.
- No authorization command permits commits, pushes, pull requests, releases, or
  remote actions.
- Supports `+`, e.g., `ok impl + tests + <other>` = `ok impl + ok tests + ok <other>`

## Documentation Rules

- Treat code, configuration, migrations, and tests as the source of truth.
- Keep `docs/` limited to current behavior, ownership, boundaries, limits,
  failure handling, and operating commands.
- Update the owning domain document; create a new file only when none exists.
- Lead with the outcome, use only necessary headings, and state each fact once.
- Prefer short paragraphs, compact lists, and tables for repeated mappings.
- Link to authoritative source instead of copying schemas, configuration, or
  test catalogs. Retain exact contracts and safety-critical limits.
- Do not include status labels, implementation journals, milestones, rollout
  plans, open questions, recommendations, or future work.
- Put concrete failed approaches in `docs/lessons-learned/`, version history
  in `docs/release/`, and active task details in this file. Delete other stale
  or duplicated material.
- Before finishing, verify links and repository paths, search for stale
  plan/status language, and run `git diff --check`.

## Notes

- Keep this reusable template. After completing a priority, reset only
  `Active Scope`, `Required Read Order`, and `Required Outcome`.
- Keep this file short and task-focused.
- `docs/architecture.md` is an architecture index, not the source of detailed behavior.
- Read `docs/lessons-learned/*` only for the subsystem being changed, when debugging
  a regression, or before reworking behavior with a known failure mode.
