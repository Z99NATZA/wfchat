create table cafe_cosmetic_loadouts (
    owner_session_id uuid primary key references auth_sessions(id) on delete cascade,
    owner_user_id uuid null,
    equipped_cosmetic text null,
    updated_at timestamptz not null default now()
);

create index idx_cafe_cosmetic_loadouts_owner_user_updated
    on cafe_cosmetic_loadouts(owner_user_id, updated_at desc, owner_session_id)
    where owner_user_id is not null;
