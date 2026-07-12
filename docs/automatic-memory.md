# Automatic Memory

Status: Phase 4 Validation Implemented - Capture And Retrieval Active

This document defines the intended replacement for the retired manual memory
system. The internal storage, provenance, chat-deletion cleanup, account
promotion, learned-context reset boundaries, durable automatic capture, and
bounded multilingual structured retrieval are implemented. Aiko can use
relevant learned context across chats for the same owner and character even
when the remembered content and the new topic use Thai and English differently.

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

Cross-language example:

```text
Earlier chat: The user says in Thai that they like nightcore music.
Stored memory: preference.music.nightcore, tags music + nightcore.
Later chat: The user starts a new chat and asks in Thai to discuss เพลง.
Result: the canonical music topic makes the nightcore preference eligible.
```

## Product Rules

- Memory capture is automatic and selective.
- There is no facts/summaries panel, per-item delete control, or memory toggle.
- Aiko uses memory subtly and qualifies uncertain recollections.
- The system must not store secrets, financial credentials, authentication
  tokens, or unsupported inferences.
- The backend and Settings UI support a confirmed learned-context reset while
  retaining chat history.
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

## Capture Flow (Implemented)

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

The user message, assistant message, attachment links, and one idempotent
`memory_extraction_jobs` outbox row are committed in the same transaction. The
API background worker claims jobs with `for update skip locked`, so extraction
runs outside the response-critical path and survives API restarts. Stale locks
are reclaimable, retries use bounded backoff, and a third failed attempt moves a
job to `dead`.

The extractor uses a strict JSON schema with at most five candidates. Every
response is deserialized with unknown fields denied and then validated again in
application code. Accepted evidence must be an exact substring of the persisted
user message. Keys, kinds, tags, lengths, confidence, importance, and evidence
strength are bounded. Messages or candidates containing secrets, credentials,
financial identifiers, unsupported evidence, temporary instructions, or
low-value details are rejected before any memory write.

Accepted candidates and message-level sources are saved atomically. The worker
logs job ids, attempts, error codes, counts, and process counters only; it never
logs candidate content or source message text. `AI_PROVIDER=mock` completes jobs
with no candidates. OpenAI-compatible configured providers use the existing
backend-owned base URL, model, and credentials for extraction.

The extractor is asked to use the bounded canonical topic tags `music`,
`gaming`, `food`, `travel`, `anime`, and `coding` when applicable while keeping
useful specific tags such as `nightcore`. Application validation remains the
authority: known Thai/English category aliases are normalized to canonical
tags, canonical topics visible in keys/content are added, specific lowercase
ASCII tags are retained, duplicates are removed, and the six-tag limit remains
enforced. Existing stored tags are normalized during retrieval, so this change
does not require a data rewrite or migration.

## Deduplication And Conflict Rules

- Matching key and value: reinforce the existing memory and update confidence.
- Matching key with a clearly newer value: replace or supersede the old value.
- Conflicting low-confidence values: retain neither as authoritative until
  later conversation provides stronger evidence.
- Temporary plans may use `expires_at` and must not remain permanent facts.
- Confidence must come from user evidence, not repeated assistant assertions.

## Retrieval Flow (Implemented)

Before an AI request, retrieve a small set of relevant memory items for the chat
owner and character:

```text
current user message
  -> derive topic/category signals
  -> select candidate memories by tags and memory_key
  -> score relevance + confidence + importance + reinforcement + recency
  -> inject the top items within a fixed token budget
```

The first version uses structured keys, tags, and normalized content signals.
A small backend-owned taxonomy expands bounded Thai/English category aliases,
for example `เพลง`/`ดนตรี`/`songs` to `music` and `เกม`/`games` to `gaming`.
Canonical topics and aliases are placed before raw lexical terms within the
24-signal query budget so long Thai messages cannot truncate the cross-language
match. The exact same expanded signals drive PostgreSQL candidate selection and
application scoring.

The store prefilters at most 50 candidates using the exact guest/account owner
boundary, `character_id`, supported kinds, minimum `0.65` confidence,
non-expiration, and expanded key/tag/content topic overlap. Query expansion also
contains bounded legacy aliases, allowing older tags such as `songs` to match a
canonical `music` query without rewriting stored rows. Embeddings and vector
search remain deferred until evaluation shows that this deterministic metadata
retrieval is insufficient.

Application code validates candidates again and assigns deterministic scores
from lexical relevance, canonical-topic relevance, confidence, importance,
source reinforcement, and recency. A specific lexical match such as
`nightcore` ranks before a category-only `music` match. Category-only matches
are limited to at most two items overall and one item for the same canonical
topic, preventing a broad request such as “talk about music” from injecting
many weakly related preferences. Duplicate keys keep the newest corrected
value. Stable tie-breakers make selection independent of database return order.

The injected `LEARNED_CONTEXT_V1` block is limited to five items, 1,200 Unicode
characters, and an estimated 300 tokens. It contains normalized memory content,
stable keys, and a coarse `likely` or `uncertain` label only—never raw source
messages, provenance text, extraction jobs, or credentials. The block is placed
after the character prompt and before current-chat messages for both streaming
and non-streaming requests.

Memory context remains explicitly untrusted soft guidance. Its system wrapper
tells Aiko to use only relevant items, prefer the latest user message when it
conflicts, never reveal the context block, and use language such as "if I
remember correctly" for uncertain items. Retrieval is fail-open: a
memory-specific database error is logged with metadata only and chat continues
without learned context.

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

## Learned-Context Reset (Implemented)

The Settings action supports:

- Learned-context reset: delete memory items, sources, and queued extraction
  jobs while retaining chat history.
- The same owner boundary for guests and registered accounts.
- Explicit destructive confirmation before the request is sent.
- A single action labelled with the active character name; there is no
  per-memory manager, section heading, or explanatory copy in the normal flow.

`DELETE /api/learned-context` invokes the owner-scoped store transaction. It
deletes memory items, sources, and queued extraction jobs while retaining chat
history. The UI obtains the character name from chat configuration and passes it
through the `{aiko}` i18n interpolation parameter rather than hardcoding it in
the translation string.

A full reset that also deletes chat history is not exposed by this action.

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

- Status: implemented.
- Extraction jobs are enqueued atomically with successful persisted turns.
- A background worker provides bounded retries and restart-safe claiming.
- Strict structured output, evidence grounding, sensitive-data filtering,
  deduplication, reinforcement, and explicit correction handling run before
  atomic persistence.
- Operational logs and in-process counters exclude raw learned content and
  source text.

### Phase 3: Retrieval

- Status: implemented.
- Owner/character candidate lookup filters confidence, kinds, expiration, and
  bounded multilingual canonical/lexical topic signals before deterministic
  scoring.
- Candidate lookup and scoring use the same expanded signals; specific matches
  outrank broad category matches, which have stricter selection limits.
- Selection enforces strict item, character, and estimated-token budgets.
- One shared preparation path injects untrusted soft context after the
  character prompt for streaming and non-streaming requests.
- Tests cover related retrieval, unrelated exclusion, ownership, character
  isolation, expiration, correction precedence, deterministic ordering,
  budgets, and endpoint parity.

### Phase 4: Validation And Basic Operations

Status: implemented. Reset and Control, the deterministic Evaluation Suite,
Basic Observability, and Expiration Tests are complete.

#### Reset And Control

- Status: implemented.
- Settings exposes only a destructive reset button and confirmation dialog,
  with no memory list, section title, or description.
- The action deletes learned context and queued extraction work for the current
  guest or account owner while retaining chat history.
- Character naming uses the `{aiko}` i18n parameter populated from character
  configuration; translation values do not hardcode the name.

#### Evaluation Suite

- Status: implemented.
- `apps/api/src/memory_evaluation.rs` uses deterministic, synthetic English and
  Thai fixtures without a live provider or network dependency.
- Coverage includes related/unrelated/empty retrieval, Thai-English retrieval
  in both directions, canonical and legacy tags, specific-over-broad ranking,
  broad-category limits, stable ranking, strict prompt budgets, uncertainty
  guidance, repeated evidence, corrected-value precedence, and exclusion of
  credentials and internal provenance metadata.
- PostgreSQL-backed scenarios verify exact guest, registered-account, and
  character isolation and the persisted reinforcement/correction lifecycle.
- The shared chat preparation and OpenAI-compatible payload are checked for
  streaming/non-streaming parity and this order: character prompt, optional
  learned context, current-chat history, latest user message.
- Run this suite independently against the PostgreSQL test database:

```powershell
$env:WFCHAT_TEST_DATABASE_URL='postgres://postgres:postgres@localhost:5432/wfchat_phase2_test'
cargo test --manifest-path apps/api/Cargo.toml memory_evaluation -- --test-threads=1
```

#### Basic Observability

- Status: implemented.
- One `MemoryTelemetry` instance is owned by `AppState`; cloned runtime state
  shares process-lifetime atomic counters, while independently constructed test
  states remain isolated.
- Capture totals cover claimed, completed, retried, and dead jobs plus accepted
  and rejected candidates.
- Retrieval totals cover attempts, selected context, empty results, fail-open
  errors, candidate and selected-item totals, context characters, and estimated
  tokens.
- Stable structured events report completion/failure and selected/empty/fail-open
  boundaries. Fields contain aggregate counts, bounded per-operation counts,
  attempts, and sanitized error codes only—never learned content, source/latest
  messages, memory keys, prompt blocks, credentials, provider bodies, or
  owner/session/chat/job identifiers.
- Counters are deliberately dependency-free and reset when the API process
  restarts. There is no public metrics endpoint, dashboard, database storage,
  migration, or frontend control.

#### Expiration Tests

- Status: implemented.
- Deterministic application tests prove `expires_at <= now` is inactive while a
  future timestamp remains eligible, including the exact boundary without
  sleeping.
- PostgreSQL tests prove expired and boundary-time rows are excluded while an
  otherwise-equivalent future row remains retrievable for the exact account and
  character.
- Source-deletion tests prove single-source memory is removed, multi-source
  memory remains only while supported, and expired retained rows never become
  active during cleanup.
- Registered-account reset tests cover pending, retry, and processing extraction
  jobs. Reset retains chat history, removes every job state, and makes a stale
  claimed job id unable to persist or recreate memory.
- Run the lifecycle suite independently against the PostgreSQL test database:

```powershell
$env:WFCHAT_TEST_DATABASE_URL='postgres://postgres:postgres@localhost:5432/wfchat_phase2_test'
cargo test --manifest-path apps/api/Cargo.toml memory_expiration -- --test-threads=1
```

Expiration remains retrieval-time filtering plus provenance/reset cleanup. No
background expiration scheduler or new deletion policy was required.

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

## Capture Acceptance Criteria

- A durable preference stated in a persisted user turn can be captured with
  message-level provenance.
- Repeated evidence reinforces rather than duplicates a memory.
- Corrected preferences replace or supersede stale values.
- Memory extraction failures never block or lose a successful chat response.

## Retrieval Acceptance Criteria

- A relevant durable preference captured in one chat can inform another chat
  for the same owner and character.
- Thai and English category aliases can retrieve the same canonical memory in
  either direction without embeddings or a data migration.
- Unrelated, expired, weak, unsafe, cross-owner, and cross-character items are
  not injected.
- Specific terms outrank category-only matches, and broad categories cannot
  inject multiple memories for the same topic.
- Selection and truncation are deterministic and stay within all budgets.
- Streaming and non-streaming requests use identical memory preparation.
- The latest user message overrides conflicting learned context.

## Non-Goals For The First Version

- Remembering every conversation detail.
- User-facing per-memory management.
- Vector database or full RAG infrastructure.
- Automatic conversation summaries as the primary memory format.
- Cross-character memory sharing.
