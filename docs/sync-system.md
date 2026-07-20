# Sync System

WFChat's generic sync is an account-scoped delta/cache layer for selected
settings and chat readback. It does not replace canonical chat persistence.

## Scope

Synced item types:

- settings: theme, font, locale, and background image URL
- chat session summaries
- messages from the active mounted chat
- chat-session and chat-message tombstones

Not included:

- raw image bytes or attachment metadata
- automatic memory
- Cafe progress, cosmetics, or realtime room state
- every chat/message that is not present in the mounted frontend snapshot

Cafe and automatic memory use their own owner-scoped PostgreSQL tables.

## Ownership

Guests own sync rows by session id. Google login promotes current guest rows to
`owner_user_id`; registered sessions read and write by that account id.
Browsers authenticate with the HTTP-only `wfchat_session` cookie.
`X-WFChat-Session` remains a compatibility path for non-browser callers.

`sync_entities` stores the latest value for an item. `sync_commits` records
`operation_id` per session so repeated commit requests return the original
result.

## Item And API Contract

```json
{
  "item_id": "settings.theme",
  "item_type": "setting",
  "updated_at": 1780325400,
  "deleted_at": null,
  "payload": { "key": "theme", "value": "dark" }
}
```

| Method | Route | Behavior |
| --- | --- | --- |
| `GET` | `/api/sync/changes?cursor=0&limit=100` | Returns up to 1-500 newer items and a timestamp cursor |
| `POST` | `/api/sync/preview` | Counts creates, updates, and stale/invalid conflicts |
| `POST` | `/api/sync/commit` | Upserts valid items and records an operation id |

Preview classifies an incoming timestamp greater than or equal to the stored
timestamp as an update. Commit overwrites only when the stored timestamp is not
newer. There is no field-level merge or conflict payload. Commit currently
returns `conflict_count: 0`; rejected/stale items are reflected only by a lower
`merged_count`.

## Browser Flow

Local settings and chat snapshots are compacted by `item_id` into a persisted
`wfchat-sync-queue`. The queue:

- keeps at most 20 newest operations
- processes the first operation through preview then commit
- removes it only after a successful commit
- retains it on failure and records exponential backoff plus jitter, capped at
  300 seconds

Authenticated app startup pulls changes and flushes an existing queue. The
browser `online` event repeats both operations. `Sync now` enqueues the
current settings and mounted chat snapshot, drains eligible work, then pulls.
Theme and background changes also trigger immediate authenticated sync; font
and locale wait for another enqueue trigger.

Pulled settings are ignored when their timestamp is older than
`wfchat-sync-meta`. Accepted values update storage, document state, and React
state without marking the change as a new local edit.

Pulled chat data is stored in local session/message caches. If a cached chat does
not exist in canonical `/api/chats/:id`:

- cached messages make it available as read-only recovery content
- no cached messages causes local removal and a tombstone enqueue

## Current Limits

- Sync writes only `sync_entities`; pulled chats are not materialized into
  backend `chats` or `chat_messages`.
- A sync operation includes only the loaded persona's sessions and active
  chat's messages, not a full account enumeration.
- Active-chat message timestamps are generated at enqueue time.
- Pull performs one page and advances a timestamp-only cursor. More than one
  page of rows sharing the same timestamp can be skipped.
- Applying a page and saving its cursor are not atomic; a partial local apply
  has no checkpoint recovery.
- Registered `owner_user_id + item_id` uniqueness is enforced by store logic
  rather than a database unique constraint, so concurrent same-item inserts can
  race.
- A failed API delete that occurs before local tombstone creation cannot later
  be reconstructed by sync.
- Sync state and retry metadata live in localStorage; observability is limited
  to UI state and tests.

These limits are part of the current contract. Do not describe this layer as
complete canonical or offline-first chat sync.

## Ownership And Verification

- API: `apps/api/src/sync.rs`
- Persistence: `apps/api/src/store/sync.rs`
- Browser queue, pull, cache, and merge:
  `apps/web/src/services/syncService.ts`
- Setting timestamps: `apps/web/src/stores/syncStateStore.ts`
- App orchestration: `apps/web/src/app/App.tsx`

Unit/flow tests cover queue compaction, retry, stale settings, tombstones, and
API round trips. Playwright covers authenticated pull, guest-to-login sync,
cross-browser settings, cached chat readback, failure retention, and online
recovery.
