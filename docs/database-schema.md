# Database Schema

This project uses PostgreSQL. The current schema reference is below; migration
ownership is tracked separately in `docs/database-migrations.md`.

## Tables

### `auth_sessions`

- Purpose: guest/auth session ownership boundary for chats and memory.
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

### `memory_facts`

- Purpose: atomic user memory facts scoped by session + persona.
- Columns:
  - `id uuid primary key`
  - `owner_session_id uuid not null` -> `auth_sessions(id)` (`on delete cascade`)
  - `owner_user_id uuid null` for registered account ownership
  - `character_id text not null`
  - `content text not null`
  - `confidence double precision not null default 0.5`
  - `source_chat_id uuid null` -> `chats(id)` (`on delete set null`)
  - `created_at timestamptz not null default now()`
  - `updated_at timestamptz not null default now()`
- Indexes:
  - `idx_memory_facts_owner_character_updated (owner_session_id, character_id, updated_at desc)`
  - `idx_memory_facts_owner_user_character_updated (owner_user_id, character_id, updated_at desc)`

### `memory_summaries`

- Purpose: higher-level memory summaries scoped by session + persona.
- Columns:
  - `id uuid primary key`
  - `owner_session_id uuid not null` -> `auth_sessions(id)` (`on delete cascade`)
  - `owner_user_id uuid null` for registered account ownership
  - `character_id text not null`
  - `summary text not null`
  - `source_chat_id uuid null` -> `chats(id)` (`on delete set null`)
  - `created_at timestamptz not null default now()`
- Indexes:
  - `idx_memory_summaries_owner_character_created (owner_session_id, character_id, created_at desc)`
  - `idx_memory_summaries_owner_user_character_created (owner_user_id, character_id, created_at desc)`

### `sync_entities`

- Purpose: latest sync item state for settings, chat cache, and memory cache.
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
- One owner + `character_id` has many `memory_facts` and `memory_summaries`.
- `source_chat_id` on memory tables is optional provenance back to a chat.
