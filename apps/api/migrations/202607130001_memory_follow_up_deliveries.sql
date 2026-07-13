create table memory_follow_up_deliveries (
    id uuid primary key,
    claim_key uuid not null unique,
    memory_id uuid not null references memory_items(id) on delete cascade,
    owner_session_id uuid not null references auth_sessions(id) on delete cascade,
    owner_user_id uuid,
    character_id text not null,
    prompt text not null,
    shown_at timestamptz not null default now(),
    chat_id uuid references chats(id) on delete set null,
    created_at timestamptz not null default now(),
    constraint memory_follow_up_character_not_blank check (btrim(character_id) <> ''),
    constraint memory_follow_up_prompt_not_blank check (btrim(prompt) <> '')
);

create index idx_memory_follow_up_guest_shown
    on memory_follow_up_deliveries(owner_session_id, character_id, shown_at desc)
    where owner_user_id is null;

create index idx_memory_follow_up_user_shown
    on memory_follow_up_deliveries(owner_user_id, character_id, shown_at desc)
    where owner_user_id is not null;

create index idx_memory_follow_up_memory
    on memory_follow_up_deliveries(memory_id);
