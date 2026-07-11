# Backend Persistence Behavior History

This file records backend database persistence decisions. The current contract
lives in `docs/backend-architecture.md`; read that first when changing store or
database error behavior.

## 2026-07-11 - Commit memory extraction outbox with chat turns

Status: Active

Previous behavior:
- A successful chat transaction persisted messages and attachments only.

Problem observed:
- Enqueuing automatic-memory extraction after commit could lose work if the API
  stopped between the message commit and enqueue operation.

Decision:
- Insert the idempotent extraction job inside the existing chat append
  transaction after both messages are inserted.
- Process jobs outside the response path with skip-locked claims, bounded
  retries, stale-lock recovery, and a terminal dead state.

Why:
- A persisted turn and its durable follow-up work now have one commit boundary,
  while provider extraction failures remain isolated from chat delivery.

Regression guard:
- `store::integration_tests::persisted_turn_enqueues_exactly_one_extraction_job`
- `store::integration_tests::extraction_job_retries_are_bounded`

Related current contract:
- `docs/automatic-memory.md`
- `docs/database-migrations.md`

Related implementation:
- `apps/api/src/store.rs`
- `apps/api/migrations/202607110001_memory_extraction_outbox.sql`

## 2026-07-03 - Propagate store database errors explicitly

Status: Active

Previous behavior:
- Several store operations ignored PostgreSQL errors or converted failures into
  `None`, `false`, or empty lists.

Problem observed:
- A database outage or query failure could look like a successful write, a
  missing row, or empty user data, making operational incidents hard to detect.

Decision:
- Store methods return explicit `Result` values for database operations.
- Expected missing rows stay represented as `Ok(None)` or `Ok(false)`.
- Route handlers map expected missing rows to `404 Not Found` and let real
  database failures become logged `500 database error` responses.

Why:
- API callers should not receive optimistic success when persistence failed.
- Empty state and not-found responses must remain distinct from infrastructure
  failures.

Regression guard:
- `cargo fmt --manifest-path apps/api/Cargo.toml --check`
- `cargo test --manifest-path apps/api/Cargo.toml`

Related current contract:
- `docs/backend-architecture.md`

Related implementation:
- `apps/api/src/store.rs`
- `apps/api/src/error.rs`
- `apps/api/src/auth.rs`
- `apps/api/src/chat.rs`
- `apps/api/src/sync.rs`
