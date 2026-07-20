# Automatic Memory

WFChat uses automatic memory to keep companion conversations consistent across
chats. It is not document RAG: there are no embeddings, vector search, or vector
database. The system stores selected user facts as structured records and
retrieves them through keys, tags, and bounded lexical signals.

## Scope

Memory is isolated by owner and `character_id`. It may store explicit:

- preferences and profile details
- goals, constraints, and meaningful plans
- experiences useful in later conversations

It rejects secrets, credentials, financial identifiers, unsupported guesses,
prompt-injection text, temporary instructions, fleeting details, and assistant
claims. Time-bound plans and goals require an expiration time; durable memories
do not expire.

There is no per-item memory UI or public listing API. Settings exposes only a
confirmed learned-context reset.

## Data

- `memory_items`: normalized content keyed by `memory_key`, with kind, tags,
  confidence, importance, reinforcement time, and optional expiration.
- `memory_sources`: chat/message evidence supporting each item.
- `memory_extraction_jobs`: durable outbox jobs created with successful chat
  turns.
- `memory_follow_up_deliveries`: idempotent New Chat prompts and their optional
  destination chat.

PostgreSQL enforces one key per owner and character. One item may have several
sources, so repeated evidence reinforces it without creating duplicates.

## Capture

```text
persist user message + assistant message + extraction job atomically
  -> background worker claims the job
  -> model returns at most five structured candidates
  -> application validates evidence, safety, type, confidence, and expiration
  -> insert, reinforce, or replace by memory_key
  -> attach the source message
```

The worker runs in the API process, polls durable jobs, retries with bounded
backoff, and marks the third failure dead. Capture never delays or rolls back a
successful chat response. `AI_PROVIDER=mock` completes jobs without candidates.

The message request includes an IANA timezone. The normalized timezone and
capture time stay on the job so relative dates are interpreted consistently
after retries.

## Retrieval

Before text generation, the shared streaming/non-streaming preparation path:

1. Derives at most 24 topic and lexical signals from the latest user message.
2. Expands the bounded Thai/English taxonomy for `anime`, `coding`, `food`,
   `gaming`, `music`, and `travel`.
3. Prefilters at most 50 PostgreSQL candidates by exact owner, character,
   supported kind, confidence (`>= 0.65`), expiration, key, tags, and content.
4. Scores relevance, confidence, importance, reinforcement, and recency.
5. Injects the best relevant items as an untrusted `LEARNED_CONTEXT_V1` system
   message.

Specific matches rank before broad topic matches. Broad-only results are capped
at two overall and one per topic. The final block is limited to five items,
1,200 Unicode characters, and about 300 tokens.

Provider message order is:

```text
character system prompt
optional learned context
current-chat history
latest user message
```

The wrapper tells the model to ignore conflicting or irrelevant memory, prefer
the latest user message, qualify uncertain memories, and never expose the
context block. Retrieval errors are fail-open: chat continues without memory.

## New Chat Follow-Up

`POST /api/personas/:persona_id/follow-up` accepts `{ claim_key, locale }` and
returns at most one unused, unresolved `plan` or `goal`. Eligible items require
confidence `>= 0.8`, importance `>= 0.65`, age no greater than 30 days, and a
future expiration when one exists.

The claim key makes retries idempotent. One owner and character receives at most
one follow-up in a rolling 24-hour window. Replying creates a chat with the exact
stored prompt as its first assistant message.

## Lifecycle And Privacy

- Guest ownership uses the session; registered ownership uses the account and
  works across its sessions.
- Account promotion merges duplicate keys and preserves sources and follow-up
  references.
- Deleting a chat or clearing its messages removes matching sources, deletes
  unsupported items, and recalculates confidence for retained items.
- `DELETE /api/learned-context` deletes the owner's items, sources, follow-up
  state, and queued/processing extraction work while retaining chat history.
- Expired items are excluded at query time even before physical cleanup.
- Logs and in-process counters contain ids, reason codes, and counts—not source
  messages, memory content, prompts, credentials, or provider bodies.

## Ownership

- Capture, retrieval, follow-ups, and validation: `apps/api/src/memory.rs`
- Prompt preparation: `apps/api/src/chat/messages.rs`
- Persistence: `apps/api/src/store/memory.rs`
- Schema: `apps/api/migrations/202607100003_automatic_memory_foundation.sql`
  and later memory migrations
- Deterministic evaluation: `apps/api/src/memory_evaluation.rs`

Run focused backend coverage with:

```powershell
cargo test --manifest-path apps/api/Cargo.toml memory_evaluation -- --test-threads=1
```
