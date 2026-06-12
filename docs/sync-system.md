# Sync System

This document is the source of truth for the current sync implementation and
the next planned sync scope. It replaces the old standalone
`docs/_sync-known-gaps.md` file.

## Goals

The sync system is designed to:

- Let users start immediately as guests without requiring login.
- Promote guest-owned data to an account after Google login.
- Keep settings, chat cache, and memory cache available across browsers/devices
  for the same account.
- Avoid blocking the core chat UX when sync is offline or temporarily failing.

## Current State

Implemented:

- Backend guest sessions.
- In-app auth UI with Google login.
- Guest-to-account promotion for chat, memory, and sync rows.
- Account-scoped ownership through `owner_user_id` for registered users.
- Sync APIs:
  - `GET /api/sync/changes?cursor=...`
  - `POST /api/sync/preview`
  - `POST /api/sync/commit`
- Client-side sync queue with retry, exponential backoff, and bounded jitter.
- Cloud-to-local pull into local settings/cache.
- Sync items for:
  - settings: `theme`, `font`, `locale`, `backgroundImageUrl`
  - memory cache: facts and summaries
  - chat cache: session summaries and active-chat messages
  - tombstones for memory/chat deletes

Important limitation:

- Chat and memory sync is a V1 cache/delta layer, not a complete canonical
  database sync. The sync API writes to `sync_entities`; it does not currently
  materialize pulled sync items back into the main `chats`, `chat_messages`,
  `memory_facts`, or `memory_summaries` tables.

## Terminology

`Guest`

- A user who has not logged in.
- Owns data by backend `session_id`.

`Session`

- Backend user session identifier.
- Sent by the frontend with `X-WFChat-Session`.

`Account owner`

- A logged-in user.
- Owns cross-device data by `owner_user_id`.

`Sync item`

- A single syncable unit with `item_id`, `item_type`, `updated_at`,
  optional `deleted_at`, and JSON payload.

`Preview`

- A pre-commit check that reports create/update/conflict counts.

`Commit`

- The write operation that upserts sync items into `sync_entities` and records
  the operation in `sync_commits`.

## Backend Model

### `sync_entities`

Stores the latest sync state per item.

Columns:

- `session_id` (uuid)
- `owner_user_id` (uuid, nullable)
- `item_id` (text)
- `item_type` (text)
- `updated_at` (timestamptz)
- `deleted_at` (timestamptz, nullable)
- `payload` (jsonb)

Ownership behavior:

- Guest reads/writes are scoped by `session_id`.
- Registered reads/writes are scoped by `owner_user_id`.
- Registered upsert uses `owner_user_id + item_id` semantics so another
  browser session for the same account can pull the latest item.

### `sync_commits`

Stores operation history and idempotency metadata.

Columns:

- `operation_id` (text)
- `session_id` (uuid)
- `user_id` (uuid)
- `merged_count` (integer)
- `conflict_count` (integer)
- `committed_at` (timestamptz)

Primary key:

- `(operation_id, session_id)`

## Frontend Model

Local storage keys:

- `wfchat-auth-state`
- `wfchat.sessionId`
- `wfchat-theme`
- `wfchat-font`
- `wfchat.locale`
- `wfchat.backgroundImageUrl`
- `wfchat-sync-meta`
- `wfchat-sync-queue`
- `wfchat-sync-cursor`
- `wfchat-memory-facts-cache`
- `wfchat-memory-summaries-cache`
- `wfchat-memory-deletes-cache`
- `wfchat-chat-sessions-cache`
- `wfchat-chat-messages-cache`

`wfchat-sync-meta` stores per-setting timestamps:

```json
{
  "settings.theme": 1780325400,
  "settings.font": 1780325410,
  "settings.locale": 1780325420,
  "settings.backgroundImageUrl": 1780325430
}
```

Timestamp behavior:

- Settings use `wfchat-sync-meta` when available.
- Settings fall back to current time when no metadata exists.
- Memory sync items use record timestamps.
- Chat session sync items use session timestamps.
- Active-chat message sync items currently use enqueue-time timestamps.

## API Contract

### `GET /api/sync/changes?cursor=0&limit=100`

Response:

```json
{
  "items": [
    {
      "item_id": "settings.theme",
      "item_type": "setting",
      "updated_at": 1780325400,
      "deleted_at": null,
      "payload": { "key": "theme", "value": "dark" }
    }
  ],
  "next_cursor": 1780325400
}
```

### `POST /api/sync/preview`

Request:

```json
{
  "items": [
    {
      "item_id": "settings.theme",
      "item_type": "setting",
      "updated_at": 1780325400,
      "deleted_at": null,
      "payload": { "key": "theme", "value": "dark" }
    }
  ]
}
```

Response:

```json
{
  "to_create": 1,
  "to_update": 0,
  "conflicts": 0
}
```

### `POST /api/sync/commit`

Request:

```json
{
  "operation_id": "sync-1780325400-abc123",
  "items": [
    {
      "item_id": "settings.theme",
      "item_type": "setting",
      "updated_at": 1780325400,
      "deleted_at": null,
      "payload": { "key": "theme", "value": "dark" }
    }
  ]
}
```

Response:

```json
{
  "operation_id": "sync-1780325400-abc123",
  "merged_count": 1,
  "conflict_count": 0,
  "committed_at": 1780325401
}
```

## Merge Rules

Preview:

- Missing existing item: `to_create`.
- Incoming `updated_at >= existing.updated_at`: `to_update`.
- Incoming `updated_at < existing.updated_at`: `conflict`.
- Invalid item shape is counted as `conflict`.

Commit:

- Guest sync upserts by `(session_id, item_id)`.
- Registered sync upserts by `owner_user_id + item_id`.
- Existing rows are only overwritten when `existing.updated_at <= incoming.updated_at`.
- `operation_id` makes repeated commit calls idempotent at the commit-log layer.

Not implemented:

- Field-level merge.
- Per-field conflict reporting.
- User-facing conflict resolution.
- Accurate `conflict_count` during commit; current commit responses always record
  `conflict_count: 0`.

## User Flow

1. A guest opens the app.
2. The guest changes settings or uses chat/memory features.
3. Settings are persisted locally and their sync keys are touched.
4. The user opens the profile UI and logs in with Google.
5. The backend promotes current-session guest rows to `owner_user_id`.
6. The app shows pending sync.
7. The user clicks `Sync now`.
8. The frontend enqueues sync items into `wfchat-sync-queue`.
9. The frontend flushes the first queued operation through `preview -> commit`.
10. On success, the operation is removed from the queue.
11. If the queue is empty, pending guest sync is marked done.
12. The frontend pulls cloud changes and refreshes mounted chat state.

The current enqueue scope is intentionally limited to mounted state:

- settings from local storage
- memory facts for the currently loaded persona
- memory summaries for the currently loaded persona
- chat sessions for the currently loaded persona
- messages for the active chat only
- locally recorded memory/chat tombstones

## Queue And Retry

Queue shape:

```json
[
  {
    "operation_id": "sync-1780327000-abc123",
    "attempt": 1,
    "next_retry_at": 1780327008,
    "items": []
  }
]
```

Behavior:

- `Sync now` enqueues before flushing.
- Flush processes only the first operation.
- Success removes the first operation.
- Failure leaves the operation queued and updates retry metadata.
- Retry delay uses exponential backoff plus jitter.
- The app attempts sync again when:
  - the user clicks `Sync now`
  - the app opens while authenticated
  - the browser returns online

Current queue constraints:

- Queue length is capped to the newest 20 operations.
- Items inside an operation are compacted by `item_id`, keeping the newest
  `updated_at`.

## Known Gaps

### 1. Chat and memory sync is partial

The app syncs memory/chat deltas from currently mounted state only. It does not
yet enumerate every persona, every chat session, or every message across the
account when building a sync operation.

### 2. Data source is not single-source

Chat and memory views still merge API responses with local sync cache and use
cache fallback when API calls fail. This is useful for resilience, but the
system does not yet have one canonical source-of-truth strategy for all
chat/memory data.

### 3. Sync cache is not materialized into canonical tables

`/api/sync/commit` writes generic sync items to `sync_entities`. It does not
apply those items into `chats`, `chat_messages`, `memory_facts`, or
`memory_summaries`. Cross-device chat/memory sync therefore behaves as cache
rehydration on the client, not as server-side canonical chat/memory migration.

### 4. Conflict handling is basic

The current policy is last-write-wins by `updated_at`. There is no field-level
merge, conflict payload, conflict preview detail, or user-facing resolution UI.

### 5. Cursor recovery is basic

The pull cursor is advanced after applying a batch locally. There is no per-item
checkpoint, partial-apply recovery, or cursor tie-breaker for many items with
the same timestamp.

### 6. Deletes are not fully offline-first

Tombstones exist for memory/chat deletes, but most delete flows create
tombstones after the API delete succeeds or after a not-found response. A delete
that fails before local tombstone creation is not yet guaranteed to sync later.

### 7. Test coverage is not complete

Existing coverage includes queue helper tests, API handler tests for
preview/commit/changes, registered-owner sync coverage, and auth promotion
coverage. Missing coverage includes web e2e flows for queue/retry/pull/tombstone
and full Google verifier integration mocking.

### 8. Observability is not production-grade

The API has structured logs, but sync does not yet expose a complete metrics and
alerting set for success, failure, retry, queue depth, conflict, or pull lag.

## Next Implementation Scope

The next sync milestone should be scoped to reliability and correctness before
adding new providers or UX surface area.

In scope:

1. Add web e2e tests for:
   - queue flush success
   - retry/backoff after failed flush
   - pull applying settings/chat/memory cache
   - tombstone application for memory/chat deletes
2. Add API/integration coverage for Google login verification using a mockable
   verifier boundary.
3. Define the source-of-truth strategy for chat and memory:
   - keep sync as a client cache layer, or
   - materialize sync items into canonical backend tables.
4. Make chat/memory sync enumeration explicit:
   - all loaded local cache only, or
   - all server-known account data, or
   - all personas/chats/messages through a dedicated export endpoint.
5. Harden cursor/pull:
   - checkpoint applied batches
   - support deterministic pagination when timestamps tie
   - retry safely after partial apply failures

Out of scope for the next milestone:

- Additional login providers beyond Google.
- Field-level merge UI.
- Real-time multi-device sync.
- WebSocket transport.
- Multi-device avatar overlay sync.

Later scope:

- Field-level merge and conflict preview details.
- User-facing conflict resolution.
- Production metrics, dashboards, and alerts.

## Manual Test Checklist

1. Start backend and frontend.
2. Change theme, font, locale, or background image.
3. Verify `wfchat-sync-meta` is updated in local storage.
4. Log in with Google from the profile UI.
5. Click `Sync now`.
6. Verify network calls:
   - `POST /api/sync/preview`
   - `POST /api/sync/commit`
   - `GET /api/sync/changes`
7. Verify `merged_count > 0` when changed items are present.
8. Open a second browser/session with the same account and verify pulled
   settings/cache are applied.
9. Temporarily stop the API, reload the web app, and verify previously pulled
   chat/memory cache can still be displayed as fallback.

## Automated Tests

Relevant commands:

```powershell
cargo test
npm --prefix apps/web test
```

## Reference Files

Backend:

- `apps/api/src/sync.rs`
- `apps/api/src/store.rs`
- `apps/api/src/auth.rs`
- `apps/api/src/app.rs`

Frontend:

- `apps/web/src/services/syncService.ts`
- `apps/web/src/stores/syncStateStore.ts`
- `apps/web/src/stores/themeStore.ts`
- `apps/web/src/stores/fontStore.ts`
- `apps/web/src/stores/backgroundStore.ts`
- `apps/web/src/i18n/index.tsx`
- `apps/web/src/components/auth/AuthProfileDialog.tsx`
- `apps/web/src/pages/ChatPage.tsx`
- `apps/web/src/features/chat/hooks/useChatSession.ts`
