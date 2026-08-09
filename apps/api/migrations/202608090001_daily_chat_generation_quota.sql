alter table auth_sessions
    add column if not exists quota_carryover_user_id uuid,
    add column if not exists quota_carryover_date date;

create table if not exists chat_daily_owner_quotas (
    quota_date date not null,
    owner_kind text not null check (owner_kind in ('guest', 'account')),
    owner_id uuid not null,
    usage_count integer not null default 0 check (usage_count >= 0),
    updated_at timestamptz not null default now(),
    primary key (quota_date, owner_kind, owner_id)
);

create table if not exists chat_daily_global_quotas (
    quota_date date primary key,
    reserved_count integer not null default 0 check (reserved_count >= 0),
    consumed_count integer not null default 0 check (consumed_count >= 0),
    updated_at timestamptz not null default now()
);

create table if not exists chat_generation_quota_reservations (
    id uuid primary key,
    quota_date date not null,
    request_session_id uuid not null,
    chat_id uuid not null,
    owner_kind text not null check (owner_kind in ('guest', 'account')),
    owner_id uuid not null,
    owner_state text not null default 'reserved'
        check (owner_state in ('reserved', 'committed', 'released')),
    global_state text not null default 'reserved'
        check (global_state in ('reserved', 'consumed', 'released')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    provider_started_at timestamptz,
    committed_at timestamptz,
    released_at timestamptz,
    check (owner_state <> 'committed' or global_state = 'consumed'),
    check (global_state <> 'consumed' or provider_started_at is not null)
);

create index if not exists idx_chat_quota_reservations_stale
    on chat_generation_quota_reservations(updated_at, id)
    where owner_state = 'reserved' or global_state = 'reserved';

create index if not exists idx_chat_quota_reservations_session_date
    on chat_generation_quota_reservations(request_session_id, quota_date);

create index if not exists idx_chat_quota_reservations_date
    on chat_generation_quota_reservations(quota_date);

create index if not exists idx_chat_quota_reservations_terminal_date
    on chat_generation_quota_reservations(quota_date, id)
    where owner_state <> 'reserved' and global_state <> 'reserved';

create index if not exists idx_chat_quota_reservations_reserved_owner
    on chat_generation_quota_reservations(quota_date, owner_kind, owner_id)
    where owner_state = 'reserved';

create index if not exists idx_chat_quota_reservations_reserved_global
    on chat_generation_quota_reservations(quota_date)
    where global_state = 'reserved';
