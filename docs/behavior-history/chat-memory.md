# Chat Memory Behavior History

This file records decisions about cross-chat memory behavior. There is no active
cross-chat memory implementation; current chats only send their own stored
message history to the AI provider.

## 2026-07-10 - Retire manual facts and summaries

Status: Active

Previous behavior:
- Users manually created, edited, and deleted memory facts and summaries in the
  chat details panel.
- The backend injected recent manual entries into every chat for the same
  persona.
- Browser sync maintained a separate memory cache that was not materialized into
  the canonical memory tables.

Problem observed:
- Manual controls did not match the intended companion experience and created
  confusion about what Aiko learned automatically.
- The split between canonical rows and sync cache could display information that
  was not available to backend AI context.
- Keeping the old schema and prompt path would constrain a replacement design.

Decision:
- Remove the manual memory UI, API, prompt injection, sync cache, and persistence
  tables before designing a replacement.
- Do not reintroduce the retired facts/summaries contract as an implicit
  dependency of the replacement system.

Why:
- A replacement can define automatic capture, provenance, chat deletion, and
  retrieval semantics as one coherent contract.

Regression guard:
- Frontend and backend builds contain no manual-memory route or UI references.
- The `202607100001_remove_manual_memory.sql` migration removes the retired
  tables.
- The `202607100002_remove_manual_memory_sync_entities.sql` migration removes
  retired cache rows from `sync_entities`.

Related current contract:
- `docs/automatic-memory.md` (planned, not implemented)
- `docs/chat-sessions.md`
- `docs/sync-system.md`

Related implementation:
- `apps/api/src/chat.rs`
- `apps/web/src/features/chat/hooks/useChatSession.ts`

## 2026-07-10 - Add storage and provenance foundation

Status: Active

Previous behavior:
- No cross-chat memory persistence existed after the manual system was retired.

Problem observed:
- Automatic capture could not be added safely without account ownership,
  multi-chat provenance, deterministic chat-deletion cleanup, and a reset
  boundary.

Decision:
- Add internal `memory_items` and `memory_sources` persistence without exposing
  a manual API or changing AI chat context.
- Merge duplicate keys and preserve sources during guest-to-account promotion.
- Remove orphaned learned context transactionally when a source chat is deleted.

Why:
- Capture and retrieval can build on explicit lifecycle rules without coupling
  storage to embeddings, browser sync, or user-facing controls.

Regression guard:
- `cargo test --manifest-path apps/api/Cargo.toml store::integration_tests`
- `docker compose up -d --build`

Related current contract:
- `docs/automatic-memory.md`
- `docs/database-schema.md`

Related implementation:
- `apps/api/src/store.rs`
- `apps/api/migrations/202607100003_automatic_memory_foundation.sql`
