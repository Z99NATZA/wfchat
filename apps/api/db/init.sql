create table if not exists auth_sessions (
    id uuid primary key,
    user_id uuid not null,
    kind text not null,
    created_at timestamptz not null default now()
);

create table if not exists chats (
    id uuid primary key,
    owner_session_id uuid not null references auth_sessions(id) on delete cascade,
    character_id text not null,
    ai_profile_id text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists chat_messages (
    id uuid primary key,
    chat_id uuid not null references chats(id) on delete cascade,
    sort_order bigserial not null,
    role text not null,
    content text not null,
    created_at timestamptz not null default now()
);

alter table chat_messages add column if not exists sort_order bigserial;

create index if not exists idx_chats_owner_updated on chats(owner_session_id, updated_at desc);
create index if not exists idx_chats_owner_character_updated on chats(owner_session_id, character_id, updated_at desc);
create index if not exists idx_messages_chat_created on chat_messages(chat_id, created_at asc);
create index if not exists idx_messages_chat_sort on chat_messages(chat_id, sort_order asc);

create table if not exists memory_facts (
    id uuid primary key,
    owner_session_id uuid not null references auth_sessions(id) on delete cascade,
    character_id text not null,
    content text not null,
    confidence double precision not null default 0.5,
    source_chat_id uuid references chats(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists memory_summaries (
    id uuid primary key,
    owner_session_id uuid not null references auth_sessions(id) on delete cascade,
    character_id text not null,
    summary text not null,
    source_chat_id uuid references chats(id) on delete set null,
    created_at timestamptz not null default now()
);

create index if not exists idx_memory_facts_owner_character_updated on memory_facts(owner_session_id, character_id, updated_at desc);
create index if not exists idx_memory_summaries_owner_character_created on memory_summaries(owner_session_id, character_id, created_at desc);
