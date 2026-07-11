create table memory_extraction_jobs (
    id uuid primary key,
    chat_id uuid not null references chats(id) on delete cascade,
    user_message_id uuid not null references chat_messages(id) on delete cascade,
    assistant_message_id uuid not null references chat_messages(id) on delete cascade,
    owner_session_id uuid not null references auth_sessions(id) on delete cascade,
    owner_user_id uuid,
    character_id text not null,
    status text not null default 'pending',
    attempts integer not null default 0,
    max_attempts integer not null default 3,
    available_at timestamptz not null default now(),
    locked_at timestamptz,
    last_error_code text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint memory_extraction_jobs_status check (
        status in ('pending', 'processing', 'retry', 'completed', 'dead')
    ),
    constraint memory_extraction_jobs_attempts check (attempts >= 0),
    constraint memory_extraction_jobs_max_attempts check (max_attempts between 1 and 10),
    constraint memory_extraction_jobs_character_not_blank check (btrim(character_id) <> ''),
    constraint memory_extraction_jobs_error_code_not_blank check (
        last_error_code is null or btrim(last_error_code) <> ''
    )
);

create unique index idx_memory_extraction_jobs_user_message
    on memory_extraction_jobs(user_message_id);

create index idx_memory_extraction_jobs_claim
    on memory_extraction_jobs(available_at, created_at)
    where status in ('pending', 'retry', 'processing');

create index idx_memory_extraction_jobs_owner
    on memory_extraction_jobs(owner_session_id, created_at desc);

create index idx_memory_extraction_jobs_owner_user
    on memory_extraction_jobs(owner_user_id, created_at desc)
    where owner_user_id is not null;
