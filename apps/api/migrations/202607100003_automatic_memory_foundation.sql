create table memory_items (
    id uuid primary key,
    owner_session_id uuid not null references auth_sessions(id) on delete cascade,
    owner_user_id uuid,
    character_id text not null,
    memory_key text not null,
    kind text not null,
    content text not null,
    tags text[] not null default '{}',
    confidence double precision not null,
    importance double precision not null,
    last_reinforced_at timestamptz not null default now(),
    expires_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint memory_items_key_not_blank check (btrim(memory_key) <> ''),
    constraint memory_items_kind_not_blank check (btrim(kind) <> ''),
    constraint memory_items_content_not_blank check (btrim(content) <> ''),
    constraint memory_items_confidence_range check (confidence between 0.0 and 1.0),
    constraint memory_items_importance_range check (importance between 0.0 and 1.0)
);

create unique index idx_memory_items_guest_key
    on memory_items(owner_session_id, character_id, memory_key)
    where owner_user_id is null;

create unique index idx_memory_items_user_key
    on memory_items(owner_user_id, character_id, memory_key)
    where owner_user_id is not null;

create index idx_memory_items_guest_character_reinforced
    on memory_items(owner_session_id, character_id, last_reinforced_at desc)
    where owner_user_id is null;

create index idx_memory_items_user_character_reinforced
    on memory_items(owner_user_id, character_id, last_reinforced_at desc)
    where owner_user_id is not null;

create index idx_memory_items_tags on memory_items using gin(tags);

create table memory_sources (
    id uuid primary key,
    memory_id uuid not null references memory_items(id) on delete cascade,
    chat_id uuid not null references chats(id) on delete cascade,
    message_id uuid references chat_messages(id) on delete set null,
    evidence_strength double precision not null,
    created_at timestamptz not null default now(),
    constraint memory_sources_evidence_range check (evidence_strength between 0.0 and 1.0)
);

create unique index idx_memory_sources_message
    on memory_sources(memory_id, message_id)
    where message_id is not null;

create unique index idx_memory_sources_chat
    on memory_sources(memory_id, chat_id)
    where message_id is null;

create index idx_memory_sources_memory on memory_sources(memory_id);
create index idx_memory_sources_chat_lookup on memory_sources(chat_id);
