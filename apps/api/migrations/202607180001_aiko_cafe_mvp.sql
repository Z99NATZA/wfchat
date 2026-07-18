create table if not exists cafe_progress (
    owner_session_id uuid primary key references auth_sessions(id) on delete cascade,
    owner_user_id uuid null,
    cafe_stars integer not null default 0 check (cafe_stars >= 0),
    unlocked_cosmetics text[] not null default '{}',
    updated_at timestamptz not null default now()
);

create index if not exists idx_cafe_progress_owner_user
    on cafe_progress(owner_user_id)
    where owner_user_id is not null;

create table if not exists cafe_room_rewards (
    room_id uuid not null,
    owner_session_id uuid not null references auth_sessions(id) on delete cascade,
    owner_user_id uuid null,
    cafe_stars integer not null check (cafe_stars > 0),
    created_at timestamptz not null default now(),
    primary key (room_id, owner_session_id)
);

create index if not exists idx_cafe_room_rewards_owner_user
    on cafe_room_rewards(owner_user_id, created_at desc)
    where owner_user_id is not null;
