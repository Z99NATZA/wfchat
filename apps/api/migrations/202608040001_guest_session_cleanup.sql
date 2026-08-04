create index if not exists idx_auth_sessions_guest_cleanup
    on auth_sessions(expires_at, revoked_at, id)
    where kind = 'guest';
