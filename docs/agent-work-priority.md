# Agent Work Priority

Use this file as the first document to read before starting a new scoped agent task.

## Active Scope

Make `npm run init` synchronize each local env file with its paired example,
while preserving supported user values and removing configuration that the
application does not support.

- Treat `.env.example`, `apps/api/.env.example`, and `apps/web/.env.example` as
  the canonical key catalogs for their corresponding `.env` files. Rebuild in
  template order with template comments, preserve every canonical raw value,
  use example values only for missing keys, and remove stale keys. Do not add a
  value-migration or env-schema system.
- Complete a global preflight for all three pairs before creating a backup or
  changing a target. Parse all templates and targets, reject malformed input
  and duplicate conflicts, plan the VOICEVOX structural migration, then generic
  misplaced-key handling, missing-key insertion, stale-key removal, and final
  output. Any planning error stops the whole sync without changing a target.
- Parse logical assignment records rather than independent physical lines. A
  quoted raw value may span multiple lines; its complete record includes every
  physical line through the closing quote, even when continuation content looks
  like another assignment or comment. If record boundaries cannot be identified
  confidently, stop the global preflight without treating continuation content
  as stale.
- Collapse duplicate assignments for the same key only when their complete raw
  assignment records match exactly. Compare exact raw right-hand sides,
  including embedded line breaks, for ownership moves and renamed keys; do not
  trim, unquote, normalize, expand, interpolate, or otherwise interpret values.
  A destination is empty only when it has no assignment or has no character
  after `=`. Treat every other right-hand side, including quoted empties,
  whitespace, alternate quoting, inline content, and interpolation, as
  non-empty; if its exact raw value does not match, stop the sync rather than
  guessing or overwriting it.
- Before generic ownership handling or example insertion, migrate a legacy root
  `VOICEVOX_BASE_URL` to both `apps/api/.env:VOICEVOX_BASE_URL` and root
  `.env:WFCHAT_COMPOSE_VOICEVOX_BASE_URL`. Preserve its exact raw right-hand
  side only when each destination is absent, raw-empty, or already matches;
  otherwise stop without guessing or overwriting.
- For other misplaced keys, move a non-empty raw value only when ownership is
  unique and the destination is absent or raw-empty, discard the misplaced copy
  when the destination already matches, and stop on conflicting values or
  ambiguous ownership. Keep keys intentionally canonical in multiple examples
  in every owning file.
- Provide a best-effort multi-file transaction without claiming cross-file
  atomicity. Stage every result in the target directory, re-read targets and
  compare them with the preflight snapshots, then create every required backup
  before replacing any target. Replace each file atomically where supported;
  on partial failure restore existing targets from backup and remove targets
  newly created by the run. Report rollback failures separately.
- Report only key names, file names, and actions; never print env values or
  secrets. Running init again without input changes must be idempotent.
- Remove the unused `ANTHROPIC_*` example keys and unreachable Anthropic
  provider scaffold/dispatch handling. Document only chat providers that work:
  `mock`, `openai`, `xai`, and `lmstudio`. Default chat and transcription to
  `mock` so the canonical API example passes runtime provider validation.
- Add `RUST_LOG` to the API example. Replace the ambiguous Compose interpolation
  with root `WFCHAT_COMPOSE_VOICEVOX_BASE_URL`, mapped to container
  `VOICEVOX_BASE_URL`. Add
  `VITE_ENABLE_STREAMING_SPEECH_PLAYBACK` to both the web and root examples,
  declare all four application Vite keys in `vite-env.d.ts`, and pass the
  streaming flag through Compose and the web Docker build.
- Keep semantic validation solely in Rust `Config`; do not duplicate type,
  range, relational, provider, Vite-flag, or `RUST_LOG` rules in Node. Add a
  root command for focused init tests and run it in CI. CI must also validate
  the canonical API example through the Rust validation path in an isolated
  environment that cannot override example values.
- Do not change root/API env loading precedence, add a provider, broadly
  refactor provider architecture, or address unrelated dependency findings.

## Required Read Order

1. `docs/agent-work-priority.md`
2. `scripts/init-env.mjs`
3. `.env.example`, `apps/api/.env.example`, and `apps/web/.env.example`
4. `package.json` and `.github/workflows/ci.yml`
5. `docker-compose.yml`, `apps/web/Dockerfile`, and `apps/web/.dockerignore`
6. `apps/api/src/main.rs`, `apps/api/src/config.rs`, `apps/api/src/ai/mod.rs`, and
   `apps/api/src/ai/providers/`
7. `apps/web/src/vite-env.d.ts`, `apps/web/vite.config.ts`, and the runtime
   consumers of `import.meta.env`
8. `README.md`, `docs/docker.md`, `docs/chat-voice.md`,
   `docs/backend-architecture.md`, `docs/chat-image-attachments.md`, and
   `docs/ci.md`

## Required Outcome

`npm run init` produces local env files whose unique key sets exactly match
their paired examples without losing canonical values. Missing, stale,
misplaced, duplicate, raw-value ambiguity, VOICEVOX migration, global-preflight,
concurrent-change, staging, backup, partial-replace, rollback, secret-bearing,
multiline-quoted-value preservation, unterminated-record rejection, and
repeat-run behavior is covered by focused tests using temporary fixtures rather
than the repository's real local env files, and CI runs those tests. The
canonical API example passes the real Rust validator in isolation. Local Vite
and Compose web builds expose the same supported streaming flag. Examples,
runtime code, and current-behavior documentation agree on supported keys and
providers.

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
