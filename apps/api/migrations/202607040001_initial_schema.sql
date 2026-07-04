create table if not exists auth_sessions (
    id uuid primary key,
    user_id uuid not null,
    kind text not null,
    created_at timestamptz not null default now()
);

create table if not exists auth_identities (
    user_id uuid not null,
    provider text not null,
    provider_subject text not null,
    email text,
    provider_name text,
    provider_avatar_url text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (provider, provider_subject)
);

create index if not exists idx_auth_identities_user_updated on auth_identities(user_id, updated_at desc);

create table if not exists user_profiles (
    user_id uuid primary key,
    display_name text not null,
    avatar_url text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists chats (
    id uuid primary key,
    owner_session_id uuid not null references auth_sessions(id) on delete cascade,
    owner_user_id uuid,
    character_id text not null,
    ai_profile_id text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table chats add column if not exists owner_user_id uuid;

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
create index if not exists idx_chats_owner_user_updated on chats(owner_user_id, updated_at desc);
create index if not exists idx_chats_owner_user_character_updated on chats(owner_user_id, character_id, updated_at desc);
create index if not exists idx_messages_chat_created on chat_messages(chat_id, created_at asc);
create index if not exists idx_messages_chat_sort on chat_messages(chat_id, sort_order asc);

create table if not exists chat_attachments (
    id uuid primary key,
    owner_session_id uuid not null references auth_sessions(id) on delete cascade,
    owner_user_id uuid,
    chat_id uuid references chats(id) on delete cascade,
    message_id uuid references chat_messages(id) on delete cascade,
    kind text not null,
    mime_type text not null,
    byte_size bigint not null,
    width integer,
    height integer,
    sha256 text not null,
    storage_key text not null,
    created_at timestamptz not null default now(),
    deleted_at timestamptz
);

alter table chat_attachments add column if not exists owner_user_id uuid;
alter table chat_attachments add column if not exists chat_id uuid references chats(id) on delete cascade;
alter table chat_attachments add column if not exists message_id uuid references chat_messages(id) on delete cascade;
alter table chat_attachments add column if not exists deleted_at timestamptz;

create index if not exists idx_chat_attachments_owner_created on chat_attachments(owner_session_id, created_at desc);
create index if not exists idx_chat_attachments_owner_user_created on chat_attachments(owner_user_id, created_at desc);
create index if not exists idx_chat_attachments_message on chat_attachments(message_id);
create index if not exists idx_chat_attachments_chat on chat_attachments(chat_id);

create table if not exists memory_facts (
    id uuid primary key,
    owner_session_id uuid not null references auth_sessions(id) on delete cascade,
    owner_user_id uuid,
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
    owner_user_id uuid,
    character_id text not null,
    summary text not null,
    source_chat_id uuid references chats(id) on delete set null,
    created_at timestamptz not null default now()
);

alter table memory_facts add column if not exists owner_user_id uuid;
alter table memory_summaries add column if not exists owner_user_id uuid;

create index if not exists idx_memory_facts_owner_character_updated on memory_facts(owner_session_id, character_id, updated_at desc);
create index if not exists idx_memory_summaries_owner_character_created on memory_summaries(owner_session_id, character_id, created_at desc);
create index if not exists idx_memory_facts_owner_user_character_updated on memory_facts(owner_user_id, character_id, updated_at desc);
create index if not exists idx_memory_summaries_owner_user_character_created on memory_summaries(owner_user_id, character_id, created_at desc);

create table if not exists sync_commits (
    operation_id text not null,
    session_id uuid not null references auth_sessions(id) on delete cascade,
    user_id uuid not null,
    merged_count integer not null,
    conflict_count integer not null,
    committed_at timestamptz not null default now(),
    primary key (operation_id, session_id)
);

create index if not exists idx_sync_commits_session_committed on sync_commits(session_id, committed_at desc);

create table if not exists sync_entities (
    session_id uuid not null references auth_sessions(id) on delete cascade,
    owner_user_id uuid,
    item_id text not null,
    item_type text not null,
    updated_at timestamptz not null,
    deleted_at timestamptz,
    payload jsonb not null default '{}'::jsonb,
    primary key (session_id, item_id)
);

alter table sync_entities add column if not exists owner_user_id uuid;

create index if not exists idx_sync_entities_session_updated on sync_entities(session_id, updated_at desc);
create index if not exists idx_sync_entities_owner_user_updated on sync_entities(owner_user_id, updated_at desc);
create index if not exists idx_sync_entities_owner_user_item on sync_entities(owner_user_id, item_id);

update chats
set owner_user_id = auth_sessions.user_id
from auth_sessions
where chats.owner_session_id = auth_sessions.id
  and auth_sessions.kind <> 'guest'
  and chats.owner_user_id is null;

update memory_facts
set owner_user_id = auth_sessions.user_id
from auth_sessions
where memory_facts.owner_session_id = auth_sessions.id
  and auth_sessions.kind <> 'guest'
  and memory_facts.owner_user_id is null;

update memory_summaries
set owner_user_id = auth_sessions.user_id
from auth_sessions
where memory_summaries.owner_session_id = auth_sessions.id
  and auth_sessions.kind <> 'guest'
  and memory_summaries.owner_user_id is null;

update sync_entities
set owner_user_id = auth_sessions.user_id
from auth_sessions
where sync_entities.session_id = auth_sessions.id
  and auth_sessions.kind <> 'guest'
  and sync_entities.owner_user_id is null;

update chat_attachments
set owner_user_id = auth_sessions.user_id
from auth_sessions
where chat_attachments.owner_session_id = auth_sessions.id
  and auth_sessions.kind <> 'guest'
  and chat_attachments.owner_user_id is null;
