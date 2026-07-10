# Automatic Memory

Status: Phase 1 Implemented - Capture And Retrieval Not Implemented

This document defines the intended replacement for the retired manual memory
system. The internal storage, provenance, chat-deletion cleanup, account
promotion, and learned-context reset boundaries are implemented. Automatic
extraction and retrieval are not implemented, so Aiko does not use this data in
chat responses yet.

## Goal

Aiko should retain selected long-term information from past conversations and
use it naturally when a related topic returns, including in a different chat.
The system should remember durable user context without storing every message as
memory or exposing a manual memory manager in the UI.

Example:

```text
Earlier chat: The user says they like spicy ramen while travelling.
Later chat: The user asks for Osaka travel recommendations.
Aiko: If I remember correctly, you enjoy spicy ramen when travelling...
```

## Product Rules

- Memory capture is automatic and selective.
- There is no facts/summaries panel, per-item delete control, or memory toggle.
- Aiko uses memory subtly and qualifies uncertain recollections.
- The system must not store secrets, financial credentials, authentication
  tokens, or unsupported inferences.
- The backend supports a hard reset of learned context. A future Settings action
  will expose it when the product flow is ready.
- The replacement must not reuse the retired manual memory API or sync-cache
  contract.

## What To Remember

Good candidates:

- Stable preferences and dislikes.
- Preferred name, language, and response style.
- Recurring travel, food, hobby, or activity preferences.
- Long-term goals and constraints that improve future recommendations.
- Important experiences that the user explicitly describes.

Do not retain:

- One-off instructions that apply only to the current turn.
- Guesses made by Aiko rather than statements from the user.
- Sensitive data that is not required for the companion experience.
- Raw conversation text as a substitute for a structured memory.

## Implemented Data Model

### `memory_items`

One normalized piece of learned user context:

- `id uuid primary key`
- `owner_session_id uuid not null` for the originating session
- `owner_user_id uuid null` for registered account ownership
- `character_id text`
- `memory_key text` for deduplication, such as `travel.food.preference`
- `kind text`, such as `preference`, `profile`, `plan`, or `experience`
- `content text` containing a short human-readable fact
- `tags text[]`
- `confidence double precision`
- `importance double precision`
- `last_reinforced_at timestamptz`
- optional `expires_at timestamptz`
- `created_at` and `updated_at` timestamps

Partial unique indexes enforce one `memory_key` per character and guest session
or registered account. A GIN index on `tags` provides a metadata retrieval path
without requiring embeddings.

### `memory_sources`

Provenance connecting one memory to one or more conversations:

- `id uuid primary key`
- `memory_id uuid` referencing `memory_items` with `on delete cascade`
- `chat_id uuid` referencing `chats` with `on delete cascade`
- optional `message_id uuid` referencing `chat_messages` with `on delete cascade`
- `evidence_strength double precision`
- `created_at timestamptz`
- unique constraint for the memory/message source pair

One memory may have multiple sources. This allows repeated statements to
reinforce a memory without duplicating it.

## Capture Flow (Not Implemented)

Memory extraction runs after a user and assistant turn has been persisted:

```text
persist chat turn
  -> enqueue extraction job
  -> extractor reads a small recent message window
  -> return structured candidate memories
  -> validate categories and sensitive-data rules
  -> deduplicate or update by memory_key
  -> attach source chat/message evidence
```

The extractor must return structured JSON rather than free-form text. Extraction
should run outside the response-critical path so memory work does not delay the
assistant reply. A database-backed job or outbox should provide retries and
avoid losing work when the API process restarts.

## Deduplication And Conflict Rules

- Matching key and value: reinforce the existing memory and update confidence.
- Matching key with a clearly newer value: replace or supersede the old value.
- Conflicting low-confidence values: retain neither as authoritative until
  later conversation provides stronger evidence.
- Temporary plans may use `expires_at` and must not remain permanent facts.
- Confidence must come from user evidence, not repeated assistant assertions.

## Retrieval Flow (Not Implemented)

Before an AI request, retrieve a small set of relevant memory items for the chat
owner and character:

```text
current user message
  -> derive topic/category signals
  -> select candidate memories by tags and memory_key
  -> score relevance + confidence + importance + reinforcement + recency
  -> inject the top items within a fixed token budget
```

The first version should use structured keys and tags. Embeddings and vector
search are deferred until real usage shows that metadata retrieval is
insufficient.

Memory context remains soft guidance. Aiko should use language such as "if I
remember correctly" when confidence is not high and should avoid forcing an old
memory into an unrelated response.

## Chat Deletion (Implemented)

Deleting a chat must remove everything learned only from that chat in the same
database transaction:

1. Delete the chat and its messages.
2. Cascade-delete matching `memory_sources` rows.
3. Recalculate affected memories from their remaining sources.
4. Delete a memory when no valid source remains.
5. Keep a memory when another chat still provides valid evidence.

This provenance rule is required before automatic capture is enabled. A single
`source_chat_id` column is not sufficient.

## Hard Reset Foundation (Implemented Internally)

A future Settings action should support:

- Learned-context reset: delete memory items, sources, and derived profile data
  while retaining chat history.
- Full reset: delete learned context and chat history.

The backend store can delete all learned context for an owner while retaining
chat history. No public API route or Settings UI exposes this operation yet.

## Implementation Plan

### Phase 1: Storage And Lifecycle

- Status: implemented.
- Ordered migrations create `memory_items` and `memory_sources`.
- Owner-scoped store methods support upsert, list, source attachment, source
  listing, and learned-context reset.
- Account promotion merges duplicate keys and preserves non-duplicate sources.
- Chat deletion removes sources, recalculates retained memory confidence, and
  deletes orphaned memories in one transaction.
- Clearing chat messages applies the same cleanup to message-level sources while
  retaining the chat itself.

### Phase 2: Automatic Capture

- Add extraction jobs/outbox records.
- Define the extractor JSON schema and prompt.
- Process extraction jobs after successful chat turns.
- Add validation, sensitive-category filtering, deduplication, and conflict
  handling.
- Add logs and metrics without recording raw sensitive content.

### Phase 3: Retrieval

- Add tag/key candidate lookup and deterministic scoring.
- Add a strict item and token budget.
- Inject selected memory after the character prompt and before chat messages.
- Add tests proving unrelated memories are not injected.

### Phase 4: Hardening

- Evaluate retrieval quality with early user conversations.
- Add confidence decay, expiration, and reinforcement tuning.
- Add embeddings only if structured retrieval misses relevant memories.
- Add the Settings hard-reset UI when the product flow is ready.

## Phase 1 Acceptance Criteria

- Guest memory is isolated by session ownership.
- Registered memory is visible across sessions for the same account.
- Account promotion merges duplicate keys and retains their distinct sources.
- Deleting the only source chat removes the learned memory.
- Deleting one of several source chats keeps memory supported elsewhere and
  recalculates confidence from the remaining evidence.
- Internal learned-context reset removes memory while retaining chat history.
- Clearing messages removes message-level evidence and cleans up affected
  orphaned memory.
- No retired manual memory UI, API, or browser cache is reintroduced.

## MVP Acceptance Criteria (Not Implemented)

- A durable preference stated in one chat can influence a related later chat.
- Unrelated topics do not receive that memory.
- Repeated evidence reinforces rather than duplicates a memory.
- Corrected preferences replace or supersede stale values.
- Memory extraction failures never block or lose a successful chat response.

## Non-Goals For The First Version

- Remembering every conversation detail.
- User-facing per-memory management.
- Vector database or full RAG infrastructure.
- Automatic conversation summaries as the primary memory format.
- Cross-character memory sharing.
