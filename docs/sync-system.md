# Sync System

This document is the source of truth for the current sync implementation and
the next planned sync scope. It replaces the old standalone
`docs/_sync-known-gaps.md` file.

## Goals

The sync system is designed to:

- Let users start immediately as guests without requiring login.
- Promote guest-owned data to an account after Google login.
- Keep settings and chat cache available across browsers/devices for the same
  account.
- Avoid blocking the core chat UX when sync is offline or temporarily failing.

## Current State

Cafe Stars are intentionally outside this generic sync protocol. They are
canonical owner-scoped PostgreSQL rows read through `/api/cafe/progress`; guest
rows follow the existing account-promotion transaction on login. Ephemeral room
state uses WebSocket and is never stored in `sync_entities`.

### Completed

- Backend guest sessions.
- In-app auth UI with Google login.
- Guest-to-account promotion for chat and sync rows.
- Account-scoped ownership through `owner_user_id` for registered users.
- Sync APIs:
  - `GET /api/sync/changes?cursor=...`
  - `POST /api/sync/preview`
  - `POST /api/sync/commit`
- Client-side sync queue with retry, exponential backoff, and bounded jitter.
- Cloud-to-local pull into local settings/cache.
- Sync items for:
  - settings: `theme`, `font`, `locale`, `backgroundImageUrl`
  - chat cache: session summaries and active-chat messages
  - tombstones for chat deletes
- Automatic pull when the app is authenticated.
- Automatic queue flush when the app is authenticated and a sync queue already
  exists.
- Automatic app-setting sync for theme and background image changes while
  authenticated.
- Stale chat cleanup from the chat UI: when a listed chat cannot be loaded from
  the backend and has no cached messages, the frontend removes it locally,
  records a chat-session tombstone, and attempts to flush local delete
  tombstones immediately.
- Stale pulled setting guard that avoids applying a cloud setting when the
  local `wfchat-sync-meta` timestamp is newer.
- Uniform pulled setting handling for theme, font, locale, and background image:
  pulled values record the cloud timestamp, avoid touching local edit metadata,
  and update React state through pulled-setting callbacks.
- Web sync flow tests for enqueue/flush/pull, retry, stale pulled settings, and
  tombstone pull behavior.
- Minimal Playwright browser E2E foundation with a dedicated `test:e2e`
  command, network-mocked sync helpers, and an authenticated boot smoke test
  that verifies remote setting pull into local sync state.
- Browser E2E coverage for guest-to-login manual sync with a fake Google
  Identity script, mocked guest-to-registered auth transition, and assertions
  that the queued local setting is committed and the local queue clears.
- Browser E2E coverage for cross-browser setting pull using two registered
  browser contexts and one shared fake remote sync server, so the second
  context pulls the item committed by the first context.
- Browser E2E coverage for pulled chat tombstone propagation: an authenticated
  app boot seeds local chat cache, pulls a matching tombstone, removes the
  cached session from local storage, and verifies the deleted chat does not
  reappear after page refresh.
- Browser E2E coverage for failed manual sync preview: a registered browser
  clicks `Sync now`, the preview request fails, the local queued setting remains
  in `wfchat-sync-queue`, and retry metadata records an incremented attempt
  with a future `next_retry_at`.
- Browser E2E coverage for failed manual sync commit: a registered browser
  clicks `Sync now`, preview succeeds, commit fails, the local queued setting
  remains in `wfchat-sync-queue`, and retry metadata records an incremented
  attempt with a future `next_retry_at`.
- Browser E2E coverage for cross-browser pulled background and chat cache
  fixtures: a registered browser pulls a remote background image and chat
  session/message cache, then verifies local storage and rendered chat UI.
- Browser E2E coverage for stale pulled theme guard: an authenticated app boot
  seeds a newer local dark theme, pulls an older cloud light theme, keeps local
  storage and document state dark, and still advances the sync cursor.
- Browser E2E coverage for the authenticated browser `online` event: after
  initial boot pull settles, the test seeds a queued local setting and a remote
  background fixture, dispatches `online`, then verifies preview/commit and
  changes requests increase, the queue clears, and the remote background is
  applied locally.
- Browser E2E coverage for API-unavailable cache fallback after a previous pull:
  an authenticated app boot seeds local chat cache with a nonzero sync cursor,
  forces persona list APIs to fail, verifies cached chat content remains
  visible, and verifies the sync pull sees no newer remote items.

### Not Done Yet

- Full canonical chat sync into the backend `chats` and `chat_messages` tables.
- Full enumeration of every persona, chat session, and message when creating a
  sync operation.
- Field-level merge, detailed conflict payloads, or user-facing conflict
  resolution.
- Accurate `conflict_count` from `/api/sync/commit`.
- Cursor checkpointing for partial local apply failures.
- Deterministic pagination for many items sharing the same `updated_at`.
- Post-hardening browser E2E coverage for cursor tie cases, partial pull
  recovery, concurrent same-item commits, and mounted-state sync limitations.
- Production-grade metrics and alerting.

### Important Limitation

- Chat sync is a V1 cache/delta layer, not a complete canonical database sync.
  The sync API writes to `sync_entities`; it does not currently materialize
  pulled sync items back into the main `chats` or `chat_messages` tables.

- Pulled settings use dedicated pulled-setting paths. They do not touch local
  edit metadata, and app-level React state is updated through callbacks.

## Terminology

`Guest`

- A user who has not logged in.
- Owns data by backend `session_id`.

`Session`

- Backend user session identifier.
- Browser requests identify it with the HTTP-only `wfchat_session` cookie.
- `X-WFChat-Session` is only a compatibility fallback for non-browser or
  legacy local callers.

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
- The registered `owner_user_id + item_id` behavior is implemented in store
  logic, not by a database unique constraint. The database currently has an
  index for this access pattern but not a uniqueness guarantee.

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
- `wfchat-theme`
- `wfchat-font`
- `wfchat.locale`
- `wfchat.backgroundImageUrl`
- `wfchat-sync-meta`
- `wfchat-sync-queue`
- `wfchat-sync-cursor`
- `wfchat-deletes-cache`
- `wfchat-chat-sessions-cache`
- `wfchat-chat-messages-cache`

Session storage keys:

- `wfchat.sessionCookieReady`

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
- Local setting changes call `touchSyncKey(...)` so future sync operations use
  the local edit timestamp.
- Pulled setting changes call `recordSyncUpdatedAt(...)` with the cloud
  `updated_at`, write local storage without touching the local edit timestamp,
  and notify app-level callbacks when React state must update.
- Chat session sync items use session timestamps.
- Active-chat message sync items currently use enqueue-time timestamps.

Pulled setting behavior:

- `theme`: skipped when the cloud `updated_at` is older than local
  `wfchat-sync-meta`; otherwise writes local storage, applies the document
  theme, records the cloud timestamp, and updates React state through
  `applyPulledTheme`.
- `font`: skipped when stale; otherwise writes local storage, applies the
  document font, records the cloud timestamp, and updates React state through
  `applyPulledFont`.
- `locale`: skipped when stale; otherwise writes local storage and calls the
  pulled i18n locale callback without touching local edit metadata.
- `backgroundImageUrl`: skipped when stale; otherwise persists the background
  image URL, records the cloud timestamp, and calls the app background callback.
- chat items: upsert into local sync caches.
- chat tombstones: remove matching cache entries.

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

### Login And Pull

1. A guest opens the app.
2. The guest changes settings or uses chat features.
3. Settings are persisted locally and their sync keys are touched.
4. The user opens the profile UI and logs in with Google.
5. The backend promotes current-session guest rows to `owner_user_id`.
6. The app shows pending sync when `hasPendingGuestSync` is true.
7. When authenticated, the app pulls cloud changes and refreshes mounted chat
   state.
8. If a local sync queue already exists, the app attempts to flush the first
   queued operation and then pulls cloud changes.

### Manual Sync Now

1. The user clicks `Sync now`.
2. The frontend enqueues settings and, when chat is mounted, the mounted chat
   snapshot into `wfchat-sync-queue`.
3. The frontend flushes the first queued operation through `preview -> commit`.
4. On success, the operation is removed from the queue.
5. If the queue is empty, pending guest sync is marked done.
6. The frontend pulls cloud changes and refreshes mounted chat state.

### Authenticated Setting Changes

- Theme changes call `syncAppSettings()` immediately while authenticated.
- Background image changes call `syncAppSettings()` immediately while
  authenticated.
- Font and locale changes touch their sync keys, but they are not currently
  wired to the same immediate app-setting sync path from `App`.

The current enqueue scope is intentionally limited to mounted state:

- settings from local storage
- chat sessions for the currently loaded persona
- messages for the active chat only
- locally recorded chat tombstones

### Stale Chat Cleanup

Chat lists merge backend chat sessions with local sync cache. Because chat sync
is a cache layer and is not materialized into backend `chats`, a synced or
previously deleted chat can appear locally even though the current backend owner
cannot load it.

When the user selects a chat and `GET /api/chats/:chat_id` returns not found:

- if cached messages exist, the frontend opens the cached conversation for
  recovery/readback in read-only mode and disables new message sends for that
  chat id;
- if no cached messages exist, the frontend treats the chat as stale, removes it
  from the visible list, records a `chat_session` tombstone, and attempts to
  flush local delete tombstones immediately.

If that immediate flush fails, the delete operation remains in the normal sync
queue/retry path.

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

## Potential Bug Risks

These are not all confirmed bugs. They are implementation risks that should be
covered by tests before broadening sync behavior.

### 1. Authenticated font and locale changes do not immediately flush

Theme and background image changes call the app-setting sync path immediately
while authenticated. Font and locale changes touch local sync metadata, but
they are not yet wired to the same immediate flush path from `App`.

### 2. Registered sync upsert is not DB-unique

Registered sync treats `owner_user_id + item_id` as the account-level identity,
but this is implemented with update/select/insert logic rather than a unique
database constraint. Concurrent commits for the same owner and item could race.

### 3. Cursor pagination can miss same-timestamp items

`GET /api/sync/changes` uses `updated_at > cursor` and advances the cursor to
the max timestamp in the returned batch. If more than one page of items share
the same timestamp, later pages with that timestamp can be skipped.

### 4. Partial pull apply has no checkpoint

The frontend writes the cursor after applying a whole batch. If local apply is
partially successful and then fails before or during cursor persistence, retry
behavior is not explicitly modeled or tested.

### 5. Commit conflicts are not returned accurately

`POST /api/sync/preview` can report conflicts, but `POST /api/sync/commit`
records `conflict_count: 0` even when incoming items are skipped because they
are older than existing rows.

### 6. Delete tombstones are not guaranteed after failed API deletes

Chat tombstones are usually recorded after a successful delete or a
not-found response. If the API delete fails before local tombstone creation,
that deletion may not be queued for sync later. Chat sessions that are detected
as stale during selection do record a tombstone before attempting immediate
delete sync.

### 7. Mounted-state sync can miss older local data

`Sync now` only includes currently mounted persona state and active-chat
messages. Older local cache entries or server-known account data outside the
mounted view are not guaranteed to be included in the outgoing operation.

## Known Gaps

### 1. Chat sync is partial

The app syncs chat deltas from currently mounted state only. It does not yet
enumerate every persona, every chat session, or every message across the account
when building a sync operation.

### 2. Data source is not single-source

Chat views still merge API responses with local sync cache and use cache
fallback when API calls fail. This is useful for resilience, but the system does
not yet have one canonical source-of-truth strategy for all chat data.

### 3. Sync cache is not materialized into canonical tables

`/api/sync/commit` writes generic sync items to `sync_entities`. It does not
apply those items into `chats` or `chat_messages`. Cross-device chat sync
therefore behaves as cache rehydration on the client, not as server-side
canonical chat migration.

### 4. Conflict handling is basic

The current policy is last-write-wins by `updated_at`. There is no field-level
merge, conflict payload, conflict preview detail, or user-facing resolution UI.

### 5. Cursor recovery is basic

The pull cursor is advanced after applying a batch locally. There is no per-item
checkpoint, partial-apply recovery, or cursor tie-breaker for many items with
the same timestamp.

### 6. Deletes are not fully offline-first

Tombstones exist for chat deletes, but most delete flows create
tombstones after the API delete succeeds or after a not-found response. A delete
that fails before local tombstone creation is not yet guaranteed to sync later.
Stale chat cleanup is stricter: a chat that cannot be loaded from the backend
and has no cached messages records a tombstone and attempts immediate tombstone
sync.

### 7. Test coverage is not complete

Existing coverage includes queue helper tests, web sync flow tests, API handler
tests for preview/commit/changes, registered-owner sync coverage, auth
promotion coverage, and browser-level Playwright E2E flows for the first sync
rollout. Missing coverage includes post-hardening browser E2E flows, full
backend/database-backed E2E coverage, and full Google verifier integration
mocking.

### 8. Observability is not production-grade

The API has structured logs, but sync does not yet expose a complete metrics and
alerting set for success, failure, retry, queue depth, conflict, or pull lag.

## Next Implementation Scope

The next sync milestone should be scoped to reliability and correctness before
adding new providers or UX surface area.

In scope:

1. Add API/integration coverage for Google login verification using a mockable
   verifier boundary.
2. Define the source-of-truth strategy for chat:
   - keep sync as a client cache layer, or
   - materialize sync items into canonical backend tables.
3. Make chat sync enumeration explicit:
   - all loaded local cache only, or
   - all server-known account data, or
   - all personas/chats/messages through a dedicated export endpoint.
4. Harden cursor/pull:
   - checkpoint applied batches
   - support deterministic pagination when timestamps tie
   - retry safely after partial apply failures
5. Add post-hardening browser E2E coverage for the hardened behavior:
   - same-timestamp cursor pagination
   - partial pull apply recovery
   - concurrent same-account item commits
   - mounted-state sync limitations

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

## Sync E2E Rollout Plan

The first browser-level sync E2E milestone is implemented as a small
deterministic suite that catches regressions in the flows most likely to lose
data, show stale data, or resurrect deleted data. The current browser tests
mock the network boundary; backend/database-backed E2E remains later scope.

Milestone 1 is complete. The project has:

- a runnable web E2E command that is separate from unit tests
- helpers for auth state, session readiness, local storage sync state, API
  mocks, and shared fake remote sync state
- passing coverage for guest-to-login sync, cross-browser pull, and tombstone
  application
- assertions that clearly separate browser-visible state from storage-only sync
  state

The rollout details below are kept as maintenance guidance for the existing
suite and as the checklist for future hardening coverage.

### Phase 1: Minimal E2E Foundation

- Check whether Playwright or another browser E2E runner already exists, and
  add the smallest setup needed if none exists.
- Add a separate script, such as `test:e2e`, so browser tests can run without
  changing the unit test workflow or CI requirements yet.
- Add helpers for the test seams below.

Auth and session helpers:

- Seed local storage and session storage before the app boots, using
  `page.addInitScript` or the E2E runner's equivalent before navigation. This
  matters for `wfchat-auth-state`, `wfchat.sessionCookieReady`, sync queue,
  sync metadata, and sync caches because app startup effects read them early.
- For tests that exercise login, start with `wfchat-auth-state` containing
  `user: null` and `hasPendingGuestSync: true`; mock Google's browser script
  with a local fake script that renders a test button and calls the captured
  credential callback with a fake token. The app should then call the real
  `POST /api/auth/google` client path, which the test mocks as a registered
  account. This covers the login UI transition without calling real Google
  OAuth.
- For tests that bypass login, seed `wfchat-auth-state` with a registered user
  and `hasPendingGuestSync: true` when the test needs the `Sync now` action to
  be visible.
- Seed `sessionStorage["wfchat.sessionCookieReady"] = "true"` when the test
  should bypass `ensureCookieSession()`.
- Mock `GET /api/auth/me` for app mount and cookie-session fallback.
- Mock `POST /api/auth/google` for login. Do not load Google's real script or
  call real Google OAuth in Milestone 1.
- Mock `POST /api/auth/logout` for flows that exercise logout/login
  transitions.
- For sync lifecycle tests that do not care about login UI, seed authenticated
  state directly instead of clicking the Google button.

API mock matrix:

- Always mock `/api/sync/preview`, `/api/sync/commit`, and
  `/api/sync/changes`.
- Mock `/api/chat-ui/config` for app/chat startup.
- Mock `/api/personas/:personaId/chats` and `/api/chats/:chatId` when a flow
  asserts chat list, chat selection, stale chat cleanup, or cache fallback.
- If a flow creates chats or sends messages through the composer, also mock
  `POST /api/personas/:personaId/chats`, `POST /api/chats/:chatId/messages`,
  and `/api/chats/:chatId/messages/stream` as applicable.
- Mock concrete delete endpoints and follow-up list/get endpoints when testing
  tombstones through the UI, so refresh behavior is deterministic:
  `/api/chats/:chatId` and `/api/chats/:chatId/messages`.

Local state helpers:

- Seed and read `wfchat-sync-queue`, `wfchat-sync-cursor`,
  `wfchat-sync-meta`, settings keys, chat cache keys, and tombstone caches.
- Provide assertions for queue state, cursor state, cache state, and metadata
  state without requiring every item to be visible in the UI.

Remote sync helper:

- Use a shared in-memory fake sync server for browser-context tests that claim
  context A writes data and context B later pulls it.
- If a test uses a fixed `/api/sync/changes` fixture for context B instead,
  describe it as a pull fixture test, not as proof that context A committed
  data consumed by context B.

### Phase 2: First High-Value Browser Flows

1. Guest-to-login sync:
   - seed guest settings and representative chat cache
   - mock `GET /api/auth/me` as guest before login
   - intercept `https://accounts.google.com/gsi/client` with the local fake
     Google script, then click the fake Google button to produce a fake
     credential
   - mock `POST /api/auth/google` as a registered account after login
   - seed `hasPendingGuestSync: true` so `Sync now` is visible
   - when seeding chat cache, include a non-empty `lastMessage` and wait for
     ChatPage to load and merge cached state into the mounted snapshot before
     clicking `Sync now`
   - run `Sync now`
   - assert preview and commit are called
   - assert the queue is cleared, the sync metadata is stable, and local user
     data remains available
2. Cross-browser pull:
   - use two browser contexts representing the same account
   - use the shared fake sync server when context A is expected to affect
     context B
   - trigger pull in the second context
   - assert UI-visible items through the UI and storage-only items through local
     storage or cache readers
   - when testing font or locale, create the remote item through manual
     `Sync now` or a remote fixture; do not assume authenticated font/locale
     changes flush immediately
3. Delete tombstone propagation:
   - seed local chat cache
   - mock pulled tombstone sync items
   - mock backend list/get endpoints after refresh so deleted items are not
     reintroduced by unrelated API fixtures
   - assert matching cached items are removed from local storage
   - assert UI-visible deleted items do not reappear after refresh where the
     product renders those items
4. Stale pulled setting guard:
   - seed a newer local setting and matching `wfchat-sync-meta`
   - mock an older cloud setting from `/api/sync/changes`
   - assert the older cloud value does not overwrite local storage, app state,
     or visible UI where the setting is visible

### Phase 3: Failure And Retry Flows

- Preview failure keeps the queued operation intact.
- Commit failure keeps the queued operation intact.
- Retry metadata increments the attempt count and records `next_retry_at > now`.
  Use a controlled clock and `Math.random()` stub if asserting the exact retry
  timestamp.
- Browser `online` event starts queue flush and pull work. Do not assert strict
  flush-before-pull ordering unless the implementation is changed to await that
  sequence.
- API unavailable after a previous pull still allows chat cache fallback where
  the product expects it.

### Phase 4: Post-Hardening Acceptance Tests

- Multiple sync items sharing the same `updated_at` do not get skipped after the
  cursor pagination algorithm is hardened.
- Partial pull apply failures have a tested recovery path after cursor
  checkpointing is designed.
- Two browser contexts committing the same account item close together do not
  create stale or duplicated visible state.
- Mounted-state sync limitations are explicitly covered so `Sync now`
  expectations stay accurate.

Before those hardening changes exist, write characterization tests for the
current behavior instead of acceptance tests that expect the future behavior.

Out of scope for Milestone 1:

- Real Google OAuth verification in browser tests.
- Full backend/database-backed E2E coverage.
- Real-time multi-device sync.
- Field-level conflict resolution UI.

## Test Plan

### Web Unit Tests

Use `apps/web/src/services/syncService.test.ts` for local queue, pull, cache,
and tombstone behavior.

Recommended cases:

1. Queue flush success:
   - seed `wfchat.sessionCookieReady`
   - seed one queued operation
   - mock `POST /api/sync/preview` and `POST /api/sync/commit`
   - assert the first operation is removed after commit
2. Queue retry:
   - seed one queued operation
   - make preview or commit reject
   - call `markSyncRetry()`
   - assert `attempt` increments and `next_retry_at` is in the expected range
3. Settings enqueue:
   - seed `wfchat-theme`, `wfchat-font`, `wfchat.locale`, and
     `wfchat.backgroundImageUrl`
   - seed or omit `wfchat-sync-meta`
   - call `enqueueGuestSyncWithChat(...)`
   - assert setting items use the expected `updated_at` and payload values
4. Pull applies settings:
   - mock `/api/sync/changes` with theme, font, locale, and background image
   - assert local storage and callbacks are updated
   - assert stale cloud settings do not overwrite newer local metadata
5. Pull applies chat cache:
   - mock chat session and chat message items
   - call `pullSyncChanges(...)`
   - assert cache readers return the expected normalized records
6. Pull applies tombstones:
   - seed local chat caches
   - mock deleted sync items
   - assert matching cache entries are removed
7. Same-timestamp compaction:
   - pass duplicate `item_id` values to `compactItems(...)`
   - assert the newest or equal-newest item is kept

### Web Hook Tests

Use `apps/web/src/features/chat/hooks/useChatSession.test.ts` for mounted-state
sync boundaries.

Recommended cases:

1. API success plus cache merge:
   - mock API sessions/facts/summaries
   - seed sync cache with older and newer records
   - assert newer records win
2. API failure fallback:
   - make list/get calls fail
   - seed sync cache
   - assert cached sessions, messages, facts, or summaries are displayed
3. Delete tombstone creation:
   - mock successful delete
   - assert the relevant `mark*Deleted(...)` helper is called
4. Delete failure:
   - mock delete failure before not-found
   - assert no tombstone is created unless the intended offline-first behavior
     changes

### API Unit And Integration Tests

Use tests inside `apps/api/src/sync.rs`, `apps/api/src/auth.rs`, and
`apps/api/src/store/sync.rs`. Database-backed tests require `WFCHAT_TEST_DATABASE_URL`.

Recommended cases:

1. Preview actions:
   - no existing item -> create
   - newer/equal item -> update
   - older or invalid item -> conflict
2. Commit upsert:
   - guest rows upsert by `(session_id, item_id)`
   - registered rows upsert by account owner semantics
   - older incoming items do not overwrite newer existing rows
3. Commit conflict count:
   - seed a newer existing item
   - commit an older incoming item
   - assert current behavior remains `conflict_count: 0`
   - update this test when accurate commit conflicts are implemented
4. Commit idempotency:
   - commit the same `operation_id` twice
   - assert the existing commit record is returned consistently
5. Changes pagination:
   - seed more than `limit` items
   - include multiple items with the same timestamp
   - assert current cursor behavior and document any skipped same-timestamp
     case before changing the algorithm
6. Auth promotion:
   - seed guest chat and sync rows
   - promote the session through the Google token-info helper
   - assert `owner_user_id` is set and a second session for the same user can
     pull the sync item
7. Google verifier boundary:
   - introduce a mockable verifier before testing remote token verification
   - assert invalid token, wrong audience, and valid token flows without
     calling Google's real endpoint

### Web E2E Tests

A minimal Playwright browser E2E suite exists under `apps/web/e2e`. It covers
authenticated boot pull, guest-to-login manual sync, cross-browser setting
pull, cross-browser pulled background/chat cache fixtures, pulled chat tombstone
propagation, stale pulled theme guard, failed flush retry metadata for preview
and commit failures, authenticated browser `online` event sync work, and
API-unavailable chat cache fallback.
Follow the Sync E2E Rollout Plan above and prefer real browser tests that
control local storage and mock API responses at the network boundary for the
first milestone.

Recommended flows:

1. Guest changes theme to dark, logs in, clicks `Sync now`, and the queued
   setting is committed. Preconditions: mock guest `/api/auth/me`, mock
   `https://accounts.google.com/gsi/client` with a local fake Google script,
   mock registered `/api/auth/google`, seed `wfchat.sessionCookieReady`, and
   make `hasPendingGuestSync` true after login. If the fixture includes chat
   cache, include a non-empty `lastMessage` and wait for mounted chat state
   before clicking `Sync now`.
2. Logged-in user changes theme, logs out, logs back in, and stale cloud light
   does not overwrite newer local dark. Preconditions: mock `/api/auth/logout`
   and the second `/api/auth/google` login response, or seed authenticated state
   directly if the test is only covering the stale setting guard.
3. Second browser/session pulls theme, background, and chat cache for the same
   account using either a shared fake sync server or a fixed remote fixture.
   Locale and font should come from manual `Sync now` or a remote fixture, not
   from assumed immediate authenticated setting sync.
4. Failed preview/commit leaves the queue intact and shows retry metadata. For
   retry timing, assert `attempt` and `next_retry_at > now` unless the test
   controls time and random jitter.
5. Browser online event starts both pending-queue flush and remote pull work,
   without asserting a strict order between the two operations.
6. Pulled tombstones remove cached chat items. When asserting that an
   item does not reappear after refresh, mock the related list/get endpoints as
   well as `/api/sync/changes`; when the UI flow performs deletion, mock the
   concrete chat delete endpoint too.
7. API unavailable after previous pull still allows cache fallback for
   chat screens.

## Manual Test Checklist

1. Start backend and frontend.
2. Change theme, font, locale, or background image.
3. Verify `wfchat-sync-meta` is updated in local storage.
4. Log in with Google from the profile UI.
5. Verify the authenticated app pulls cloud changes with
   `GET /api/sync/changes`.
6. Click `Sync now`.
7. Verify network calls:
   - `POST /api/sync/preview`
   - `POST /api/sync/commit`
   - `GET /api/sync/changes`
8. Verify `merged_count > 0` when changed items are present.
9. Change theme or background image while still authenticated and verify the
   app sends a settings sync operation without requiring `Sync now`.
10. Open a second browser/session with the same account and verify pulled
   settings/cache are applied.
11. Temporarily stop the API, reload the web app, and verify previously pulled
   chat cache can still be displayed as fallback.
12. Verify a newer local theme is not overwritten by an older cloud theme after
   logout/login and pull.

## Automated Tests

Relevant commands:

```powershell
cargo test
npm --prefix apps/web test
```

Web E2E:

```powershell
npm --prefix apps/web run test:e2e
```

## Reference Files

Backend:

- `apps/api/src/sync.rs`
- `apps/api/src/store/sync.rs`
- `apps/api/src/auth.rs`
- `apps/api/src/app.rs`

Frontend:

- `apps/web/playwright.config.ts`
- `apps/web/e2e/helpers/syncE2eHelpers.ts`
- `apps/web/e2e/sync-cross-browser.spec.ts`
- `apps/web/e2e/sync-guest-login.spec.ts`
- `apps/web/e2e/sync-smoke.spec.ts`
- `apps/web/src/services/syncService.ts`
- `apps/web/src/stores/syncStateStore.ts`
- `apps/web/src/stores/themeStore.ts`
- `apps/web/src/stores/fontStore.ts`
- `apps/web/src/stores/backgroundStore.ts`
- `apps/web/src/i18n/index.tsx`
- `apps/web/src/components/auth/AuthProfileDialog.tsx`
- `apps/web/src/pages/ChatPage.tsx`
- `apps/web/src/features/chat/hooks/useChatSession.ts`
