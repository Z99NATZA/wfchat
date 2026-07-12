# Database Schema

This project uses PostgreSQL. Ordered migration files under
`apps/api/migrations/` are the canonical schema source; this document is the
human-readable schema reference.

## Tables

### `auth_sessions`

- Purpose: guest/auth session ownership boundary for chats and sync data.
- Columns:
  - `id uuid primary key`
  - `user_id uuid not null`
  - `kind text not null`
  - `created_at timestamptz not null default now()`

### `auth_identities`

- Purpose: external login identity records. Google data is stored here for auth/account context, not as the editable app profile.
- Columns:
  - `user_id uuid not null`
  - `provider text not null`
  - `provider_subject text not null`
  - `email text null`
  - `provider_name text null`
  - `provider_avatar_url text null`
  - `created_at timestamptz not null default now()`
  - `updated_at timestamptz not null default now()`
- Primary key:
  - `(provider, provider_subject)`
- Indexes:
  - `idx_auth_identities_user_updated (user_id, updated_at desc)`

### `user_profiles`

- Purpose: editable in-app user profile.
- Columns:
  - `user_id uuid primary key`
  - `display_name text not null`
  - `avatar_url text null`
  - `created_at timestamptz not null default now()`
  - `updated_at timestamptz not null default now()`
- Notes:
  - First Google login seeds `display_name` and `avatar_url`.
  - Later Google logins update identity fields but do not overwrite the editable profile.

### `chats`

- Purpose: chat sessions per persona/character.
- Columns:
  - `id uuid primary key`
  - `owner_session_id uuid not null` -> `auth_sessions(id)` (`on delete cascade`)
  - `owner_user_id uuid null` for registered account ownership
  - `character_id text not null`
  - `ai_profile_id text not null`
  - `created_at timestamptz not null default now()`
  - `updated_at timestamptz not null default now()`
- Indexes:
  - `idx_chats_owner_updated (owner_session_id, updated_at desc)`
  - `idx_chats_owner_character_updated (owner_session_id, character_id, updated_at desc)`
  - `idx_chats_owner_user_updated (owner_user_id, updated_at desc)`
  - `idx_chats_owner_user_character_updated (owner_user_id, character_id, updated_at desc)`

### `chat_messages`

- Purpose: ordered messages inside a chat.
- Columns:
  - `id uuid primary key`
  - `chat_id uuid not null` -> `chats(id)` (`on delete cascade`)
  - `sort_order bigserial not null`
  - `role text not null` (`user|assistant|system`)
  - `content text not null`
  - `created_at timestamptz not null default now()`
- Indexes:
  - `idx_messages_chat_created (chat_id, created_at asc)`
  - `idx_messages_chat_sort (chat_id, sort_order asc)`

### `chat_attachments`

- Purpose: validated image attachment metadata for user chat messages.
- Detailed contract: `docs/chat-image-attachments.md`.
- Columns:
  - `id uuid primary key`
  - `owner_session_id uuid not null` -> `auth_sessions(id)` (`on delete cascade`)
  - `owner_user_id uuid null` for registered account ownership
  - `chat_id uuid null` -> `chats(id)` (`on delete cascade`)
  - `message_id uuid null` -> `chat_messages(id)` (`on delete cascade`)
  - `kind text not null`
  - `mime_type text not null`
  - `byte_size bigint not null`
  - `width integer null`
  - `height integer null`
  - `sha256 text not null`
  - `storage_key text not null`
  - `created_at timestamptz not null default now()`
  - `deleted_at timestamptz null`
- Indexes:
  - `idx_chat_attachments_owner_created (owner_session_id, created_at desc)`
  - `idx_chat_attachments_owner_user_created (owner_user_id, created_at desc)`
  - `idx_chat_attachments_message (message_id)`
  - `idx_chat_attachments_chat (chat_id)`

### `memory_items`

- Purpose: normalized learned user context for the automatic-memory foundation.
- Status: automatic capture and owner/character-scoped retrieval are implemented.
- Ownership:
  - guests use `owner_session_id + character_id + memory_key`
  - registered users use `owner_user_id + character_id + memory_key`
- Columns:
  - `id uuid primary key`
  - `owner_session_id uuid not null` -> `auth_sessions(id)` (`on delete cascade`)
  - `owner_user_id uuid null` for registered account ownership
  - `character_id text not null`
  - `memory_key text not null`
  - `kind text not null`
  - `content text not null`
  - `tags text[] not null default '{}'`
  - `confidence double precision not null` constrained to `0..1`
  - `importance double precision not null` constrained to `0..1`
  - `last_reinforced_at timestamptz not null default now()`
  - `expires_at timestamptz null`
  - `created_at timestamptz not null default now()`
  - `updated_at timestamptz not null default now()`
- Indexes:
  - partial unique guest and registered-account indexes for `memory_key`
  - owner/character reinforcement-order indexes
  - GIN index on `tags`
- Retrieval:
  - candidates require supported kinds, confidence of at least `0.65`, and an
    unset or future `expires_at`
  - `expires_at <= now()` is inactive at the exact query boundary; rows do not
    require background deletion to remain excluded
  - owner and `character_id` predicates are applied in PostgreSQL before
    relevance scoring
  - one bounded set of canonical Thai/English aliases and lexical key/tag/content
    signals prefilters candidates and is reused by application scoring
  - legacy tag aliases are expanded at query/scoring time; stored rows do not
    require a multilingual backfill migration
  - specific lexical matches rank before category-only matches, and broad
    category-only selection is limited separately from the five-item prompt cap

### `memory_sources`

- Purpose: provenance connecting one memory item to one or more source chats.
- Columns:
  - `id uuid primary key`
  - `memory_id uuid not null` -> `memory_items(id)` (`on delete cascade`)
  - `chat_id uuid not null` -> `chats(id)` (`on delete cascade`)
  - `message_id uuid null` -> `chat_messages(id)` (`on delete cascade`)
  - `evidence_strength double precision not null` constrained to `0..1`
  - `created_at timestamptz not null default now()`
- Uniqueness:
  - one source per memory/message when `message_id` is present
  - one chat-level source per memory/chat when `message_id` is absent
- Lifecycle:
  - deleting a chat removes its source rows
  - clearing chat messages removes message-level source rows
  - the store deletes affected memory items with no remaining source
  - retained memory confidence is recalculated from remaining evidence

### `memory_extraction_jobs`

- Purpose: durable work records for automatic extraction after a persisted
  user/assistant turn.
- Columns:
  - `id uuid primary key`
  - `chat_id uuid not null` -> `chats(id)` (`on delete cascade`)
  - `user_message_id uuid not null` -> `chat_messages(id)` (`on delete cascade`)
  - `assistant_message_id uuid not null` -> `chat_messages(id)` (`on delete cascade`)
  - `owner_session_id uuid not null` -> `auth_sessions(id)` (`on delete cascade`)
  - `owner_user_id uuid null` for registered account ownership
  - `character_id text not null`
  - `status text not null` (`pending|processing|retry|completed|dead`)
  - `attempts integer not null default 0`
  - `max_attempts integer not null default 3`
  - `available_at`, optional `locked_at`, `created_at`, and `updated_at`
  - optional sanitized `last_error_code`; raw model output and source text are
    never stored in this table
- Indexes:
  - unique `user_message_id` for enqueue idempotency
  - partial claim index for pending, retry, and stale processing jobs
  - guest and registered-owner operational lookup indexes
- Lifecycle:
  - the outbox row is inserted in the same transaction as both chat messages
  - message/chat deletion cascades remove related work
  - guest-to-account promotion updates pending and historical job ownership
  - learned-context reset removes queued jobs so old turns cannot be recaptured

### `sync_entities`

- Purpose: latest sync item state for settings and chat cache.
- Ownership:
  - guest rows use `session_id`
  - registered rows also set `owner_user_id` so multiple browser sessions share the same account data
- Primary key:
  - `(session_id, item_id)`
- Indexes:
  - `idx_sync_entities_session_updated (session_id, updated_at desc)`
  - `idx_sync_entities_owner_user_updated (owner_user_id, updated_at desc)`
  - `idx_sync_entities_owner_user_item (owner_user_id, item_id)`

### `sync_commits`

- Purpose: commit history and idempotency for sync operations.
- Primary key:
  - `(operation_id, session_id)`

## Relationship Summary

- Guest data is owned by one `auth_session`; registered data is shared by `owner_user_id`.
- One registered `user_id` has one editable `user_profile`.
- One registered `user_id` can have one or more external `auth_identities`.
- One `chat` has many `chat_messages`.
- Image attachments belong to one owner, may be pending before send, and later become linked to one `chat_message` after successful message completion.
- One owner + `character_id` has normalized `memory_items` keyed by `memory_key`.
- One `memory_item` has one or more `memory_sources` across chats.
