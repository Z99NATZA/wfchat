alter table auth_sessions
    add column if not exists expires_at timestamptz,
    add column if not exists revoked_at timestamptz;

update auth_sessions
set expires_at = created_at + interval '30 days'
where expires_at is null;

alter table auth_sessions
    alter column expires_at set default (now() + interval '30 days'),
    alter column expires_at set not null;

create index if not exists idx_auth_sessions_active
    on auth_sessions(id, expires_at)
    where revoked_at is null;
