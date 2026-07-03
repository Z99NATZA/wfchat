# Backend Persistence Behavior History

This file records backend database persistence decisions. The current contract
lives in `docs/backend-architecture.md`; read that first when changing store or
database error behavior.

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
- `apps/api/src/memory.rs`
- `apps/api/src/sync.rs`
