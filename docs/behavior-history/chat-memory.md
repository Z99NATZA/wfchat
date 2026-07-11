# Chat Memory Behavior History

This file records decisions about cross-chat memory behavior. Automatic capture
and bounded retrieval are active; raw chat history remains isolated per chat.

## 2026-07-11 - Add a confirmed Settings memory reset

Status: Active

Previous behavior:
- The store could reset learned context internally, but users had no public
  control after automatic capture and retrieval became active.

Problem observed:
- Users need a direct way to make the companion forget learned context without
  deleting their conversation history.
- A visible memory manager or explanatory section would make the companion
  experience feel overly mechanical.

Decision:
- Expose `DELETE /api/learned-context` for the current guest or account owner.
- Add one destructive Settings button and a confirmation dialog, without a
  section heading, description, success modal, or per-memory controls.
- Use `{aiko}` i18n interpolation populated from character configuration instead
  of hardcoding the character name in UI strings.

Why:
- The user gets meaningful privacy control while the normal interface stays
  quiet and companion-oriented.

Regression guard:
- `memory::tests::reset_endpoint_clears_only_current_owner_memory_and_keeps_chat_history`
- `AppSettingsDialog.test.tsx`
- `automaticMemoryService.test.ts`

Related current contract:
- `docs/automatic-memory.md`
- `docs/i18n.md`
- `docs/components.md`

Related implementation:
- `apps/api/src/memory.rs`
- `apps/web/src/components/settings/AppSettingsDialog.tsx`
- `apps/web/src/services/automaticMemoryService.ts`

## 2026-07-11 - Add bounded structured retrieval

Status: Active

Previous behavior:
- Durable learned context was captured with provenance but never used in a
  later provider request.

Problem observed:
- Loading every memory would leak unrelated context, weaken owner/character
  isolation, and create an unbounded prompt.
- Separate streaming and non-streaming implementations could select different
  context for the same user turn.

Decision:
- Prefilter candidates in PostgreSQL by exact owner, character, supported kind,
  confidence, expiration, and structured lexical topic signals.
- Rank the bounded set deterministically using relevance, confidence,
  importance, reinforcement, and recency.
- Inject at most five items within 1,200 characters and an estimated 300 tokens
  as untrusted soft context after the character prompt.
- Use one chat-context preparation path for both endpoints and continue without
  memory when its retrieval query fails.

Why:
- Relevant cross-chat context can improve replies without embeddings or broad
  prompt exposure.
- Explicit budgets, stable tie-breakers, and fail-open behavior keep chat cost
  and reliability predictable.

Regression guard:
- `memory::tests::retrieval_selects_related_memory_and_excludes_unrelated_memory`
- `store::integration_tests::retrieval_candidates_enforce_owner_character_and_expiration`
- `chat::tests::streaming_and_non_streaming_share_bounded_memory_context_preparation`
- `docker compose up -d --build`

Related current contract:
- `docs/automatic-memory.md`
- `docs/chat-sessions.md`
- `docs/backend-architecture.md`

Related implementation:
- `apps/api/src/memory.rs`
- `apps/api/src/store.rs`
- `apps/api/src/chat.rs`

## 2026-07-11 - Add durable selective automatic capture

Status: Active

Previous behavior:
- Memory items and multi-chat provenance existed, but nothing populated them
  automatically after a conversation.

Problem observed:
- Inline extraction would delay chat responses and lose work on API restart.
- Unvalidated model text could persist secrets, unsupported guesses, or
  low-value temporary details.

Decision:
- Enqueue one extraction outbox job atomically with every persisted
  user/assistant turn and process it in an API background worker.
- Require strict structured output, exact user-message evidence, bounded
  candidate values, and sensitive/temporary/low-value rejection.
- Reinforce matching keys with distinct message sources and replace a value
  only when extraction explicitly marks newer corrective evidence.
- Keep retrieval and prompt injection out of this milestone.

Why:
- Chat delivery remains independent from model extraction failures while the
  database preserves retryable work across process restarts.
- Structured validation and provenance keep learned context auditable and
  removable with its source chat.

Regression guard:
- `cargo test --manifest-path apps/api/Cargo.toml`
- `docker compose up -d --build`

Related current contract:
- `docs/automatic-memory.md`
- `docs/database-schema.md`
- `docs/chat-sessions.md`

Related implementation:
- `apps/api/src/memory.rs`
- `apps/api/src/store.rs`
- `apps/api/migrations/202607110001_memory_extraction_outbox.sql`

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
