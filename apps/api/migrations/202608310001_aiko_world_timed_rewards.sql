create table cafe_timed_reward_progress (
    owner_kind text not null check (owner_kind in ('guest', 'account')),
    owner_id uuid not null,
    owner_session_id uuid not null references auth_sessions(id) on delete cascade,
    owner_user_id uuid null,
    reward_sequence bigint not null default 0 check (reward_sequence >= 0),
    updated_at timestamptz not null default now(),
    primary key (owner_kind, owner_id)
);

create index idx_cafe_timed_reward_progress_owner_session
    on cafe_timed_reward_progress(owner_session_id);

create index idx_cafe_timed_reward_progress_owner_user
    on cafe_timed_reward_progress(owner_user_id)
    where owner_user_id is not null;
