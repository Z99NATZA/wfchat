# Agent Work Priority

Use this file as the first document to read before starting a new scoped agent task.

## Active Scope

Harden production Aiko Cafe realtime bandwidth, backpressure, and room/socket
lifecycle boundaries. Deliver the work as three independently authorized
implementation slices. Exclude localhost fallbacks, test-only runtime fixtures
and behavior, Vite/HMR, `import.meta.env.DEV` paths such as collision debug
rendering, and asset-format or compression work. The current implementation
boundary is slice 1 only.

## Required Read Order

1. `docs/agent-work-priority.md`
2. `docs/aiko-cafe.md`
3. `docs/backend-architecture.md`
4. `docs/frontend-architecture.md`
5. `docs/lessons-learned/aiko-cafe.md`

## Required Outcome

Each standalone `ok impl` applies only to the slice explicitly agreed in the
conversation. Finish and verify that slice, then stop; do not continue into the
next slice without another explicit authorization.

1. Reduce steady-state traffic without changing the Cafe protocol. Idle players
   send no movement updates. Movement start, stop, and direction changes send
   immediately; continuous movement sends at most 10 updates per second. Each
   accepted movement marks its room dirty, and dirty movement state produces at
   most 10 room snapshots per second instead of one snapshot per message. Rooms
   without movement produce no movement snapshots. Join, leave, interaction,
   activity, cosmetic, reward, and reconnect state remain immediate. Tick work
   runs only while a room is occupied and ends when the room is removed.
   Preserve heartbeat, authoritative validation, client prediction, gameplay,
   and the existing full-snapshot protocol. Focused verification covers one
   second of idle and continuous movement, immediate transitions, coalesced
   multi-player updates, quiet clean rooms, tick shutdown, reconnects, and all
   three Cafe activities.
2. Reduce realtime payloads and isolate slow consumers: send versioned movement
   deltas instead of repeated full room state, send static map layout only when
   establishing or explicitly resynchronizing authoritative state, retain full
   snapshots for join/reconnect/resync boundaries, and keep reliable chat,
   reward, dialogue, presence, and activity events separate from replaceable
   movement state.
3. Bound production abuse and lifecycle growth: apply configurable active socket
   and room-creation limits at session, resolved-IP, and process scopes; bound
   WebSocket frame size; expire never-joined and inactive empty rooms; safely
   release limits on disconnect and cleanup; and expose production-observable
   room, connection, message-rate, lag, and outgoing-byte signals using the
   repository's existing logging or telemetry patterns.

Every slice includes focused tests for its changed boundaries and updates the
owning current-behavior documentation. Preserve the eight-player room contract,
guest/account identity, rewards, ephemeral room chat, origin validation, and
the existing development-only behavior excluded above.

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
