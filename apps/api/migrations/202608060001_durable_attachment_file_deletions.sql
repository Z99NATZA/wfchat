create table chat_attachment_file_deletions (
    storage_key text primary key,
    byte_size bigint not null,
    owner_session_id uuid,
    owner_user_id uuid,
    attempt_count integer not null default 0,
    next_attempt_at timestamptz not null default now(),
    claim_token uuid,
    claim_expires_at timestamptz,
    created_at timestamptz not null default now(),
    constraint chat_attachment_file_deletions_storage_key_not_blank
        check (btrim(storage_key) <> ''),
    constraint chat_attachment_file_deletions_byte_size_non_negative
        check (byte_size >= 0),
    constraint chat_attachment_file_deletions_attempt_count_non_negative
        check (attempt_count >= 0),
    constraint chat_attachment_file_deletions_claim_lease_complete
        check ((claim_token is null) = (claim_expires_at is null))
);

create index idx_chat_attachment_file_deletions_ready
    on chat_attachment_file_deletions(next_attempt_at, created_at, storage_key);

create index idx_chat_attachment_file_deletions_owner_session
    on chat_attachment_file_deletions(owner_session_id)
    where owner_session_id is not null;

create index idx_chat_attachment_file_deletions_owner_user
    on chat_attachment_file_deletions(owner_user_id)
    where owner_user_id is not null;

create or replace function wfchat_enqueue_chat_attachment_file_deletion()
returns trigger
language plpgsql
as $$
begin
    insert into chat_attachment_file_deletions (
        storage_key,
        byte_size,
        owner_session_id,
        owner_user_id
    )
    values (
        old.storage_key,
        old.byte_size,
        old.owner_session_id,
        old.owner_user_id
    )
    on conflict (storage_key) do update
    set byte_size = excluded.byte_size,
        owner_session_id = coalesce(
            excluded.owner_session_id,
            chat_attachment_file_deletions.owner_session_id
        ),
        owner_user_id = coalesce(
            excluded.owner_user_id,
            chat_attachment_file_deletions.owner_user_id
        ),
        next_attempt_at = least(
            chat_attachment_file_deletions.next_attempt_at,
            now()
        );

    return old;
end;
$$;

create trigger trg_chat_attachments_enqueue_file_deletion
after delete on chat_attachments
for each row
execute function wfchat_enqueue_chat_attachment_file_deletion();

-- Existing soft-deleted rows enter the same durable lifecycle as every future
-- metadata removal. The trigger snapshots ownership before the rows disappear.
delete from chat_attachments where deleted_at is not null;

create or replace function wfchat_reparent_legacy_attachment_deletions(
    batch_limit integer default 1000
)
returns bigint
language plpgsql
as $$
declare
    reparented_count bigint;
begin
    with candidates as (
        select deletion.storage_key,
               target.id as target_session_id
        from chat_attachment_file_deletions deletion
        join auth_sessions guest on guest.id = deletion.owner_session_id
        cross join lateral (
            select session.id
            from auth_sessions session
            where session.user_id = deletion.owner_user_id
              and session.kind in ('registered', 'admin')
            order by (session.revoked_at is null and session.expires_at > now()) desc,
                     session.created_at desc,
                     session.id
            limit 1
        ) target
        where deletion.owner_user_id is not null
          and guest.kind = 'guest'
          and (guest.revoked_at is not null or guest.expires_at <= now())
        order by coalesce(guest.revoked_at, guest.expires_at), deletion.storage_key
        limit greatest(batch_limit, 0)
    )
    update chat_attachment_file_deletions deletion
    set owner_session_id = candidates.target_session_id
    from candidates
    where deletion.storage_key = candidates.storage_key;

    get diagnostics reparented_count = row_count;
    return reparented_count;
end;
$$;

select wfchat_reparent_legacy_attachment_deletions(2147483647);
