# Database Schema

This project uses PostgreSQL with schema SQL at `apps/api/db/init.sql`.

## Tables

### `auth_sessions`

- Purpose: guest/auth session ownership boundary for chats and memory.
- Columns:
  - `id uuid primary key`
  - `user_id uuid not null`
  - `kind text not null`
  - `created_at timestamptz not null default now()`

### `chats`

- Purpose: chat sessions per persona/character.
- Columns:
  - `id uuid primary key`
  - `owner_session_id uuid not null` -> `auth_sessions(id)` (`on delete cascade`)
  - `character_id text not null`
  - `ai_profile_id text not null`
  - `created_at timestamptz not null default now()`
  - `updated_at timestamptz not null default now()`
- Indexes:
  - `idx_chats_owner_updated (owner_session_id, updated_at desc)`
  - `idx_chats_owner_character_updated (owner_session_id, character_id, updated_at desc)`

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

### `memory_facts`

- Purpose: atomic user memory facts scoped by session + persona.
- Columns:
  - `id uuid primary key`
  - `owner_session_id uuid not null` -> `auth_sessions(id)` (`on delete cascade`)
  - `character_id text not null`
  - `content text not null`
  - `confidence double precision not null default 0.5`
  - `source_chat_id uuid null` -> `chats(id)` (`on delete set null`)
  - `created_at timestamptz not null default now()`
  - `updated_at timestamptz not null default now()`
- Indexes:
  - `idx_memory_facts_owner_character_updated (owner_session_id, character_id, updated_at desc)`

### `memory_summaries`

- Purpose: higher-level memory summaries scoped by session + persona.
- Columns:
  - `id uuid primary key`
  - `owner_session_id uuid not null` -> `auth_sessions(id)` (`on delete cascade`)
  - `character_id text not null`
  - `summary text not null`
  - `source_chat_id uuid null` -> `chats(id)` (`on delete set null`)
  - `created_at timestamptz not null default now()`
- Indexes:
  - `idx_memory_summaries_owner_character_created (owner_session_id, character_id, created_at desc)`

## Relationship Summary

- One `auth_session` owns many `chats`.
- One `chat` has many `chat_messages`.
- One `auth_session` + `character_id` has many `memory_facts` and `memory_summaries`.
- `source_chat_id` on memory tables is optional provenance back to a chat.
