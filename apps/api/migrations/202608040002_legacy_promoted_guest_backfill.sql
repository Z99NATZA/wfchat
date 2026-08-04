create or replace function wfchat_reparent_legacy_promoted_guests(batch_limit integer default 1000)
returns bigint
language plpgsql
as $$
declare
    candidate_count bigint;
begin
    create temporary table if not exists wfchat_legacy_guest_candidates (
        id uuid primary key
    ) on commit drop;
    truncate wfchat_legacy_guest_candidates;

    insert into wfchat_legacy_guest_candidates (id)
    select session.id
    from auth_sessions session
    where session.kind = 'guest'
      and (session.revoked_at is not null or session.expires_at <= now())
    order by coalesce(session.revoked_at, session.expires_at), session.id
    limit greatest(batch_limit, 0);
    get diagnostics candidate_count = row_count;

    create temporary table if not exists wfchat_legacy_guest_targets (
        source_session_id uuid primary key,
        owner_user_id uuid not null,
        target_session_id uuid not null
    ) on commit drop;
    truncate wfchat_legacy_guest_targets;

    with account_owners as (
        select owner_session_id as source_session_id, owner_user_id from chats
        where owner_session_id in (select id from wfchat_legacy_guest_candidates)
          and owner_user_id is not null
        union all
        select owner_session_id, owner_user_id from chat_attachments
        where owner_session_id in (select id from wfchat_legacy_guest_candidates)
          and owner_user_id is not null
        union all
        select owner_session_id, owner_user_id from memory_items
        where owner_session_id in (select id from wfchat_legacy_guest_candidates)
          and owner_user_id is not null
        union all
        select owner_session_id, owner_user_id from memory_extraction_jobs
        where owner_session_id in (select id from wfchat_legacy_guest_candidates)
          and owner_user_id is not null
        union all
        select owner_session_id, owner_user_id from memory_follow_up_deliveries
        where owner_session_id in (select id from wfchat_legacy_guest_candidates)
          and owner_user_id is not null
        union all
        select owner_session_id, owner_user_id from cafe_progress
        where owner_session_id in (select id from wfchat_legacy_guest_candidates)
          and owner_user_id is not null
        union all
        select owner_session_id, owner_user_id from cafe_cosmetic_loadouts
        where owner_session_id in (select id from wfchat_legacy_guest_candidates)
          and owner_user_id is not null
        union all
        select owner_session_id, owner_user_id from cafe_room_rewards
        where owner_session_id in (select id from wfchat_legacy_guest_candidates)
          and owner_user_id is not null
        union all
        select session_id, owner_user_id from sync_entities
        where session_id in (select id from wfchat_legacy_guest_candidates)
          and owner_user_id is not null
        union all
        select commit.session_id, commit.user_id
        from sync_commits commit
        join auth_sessions guest on guest.id = commit.session_id
        where commit.session_id in (select id from wfchat_legacy_guest_candidates)
          and commit.user_id <> guest.user_id
    ), unambiguous_accounts as (
        select source_session_id,
               min(owner_user_id::text)::uuid as owner_user_id
        from account_owners
        group by source_session_id
        having count(distinct owner_user_id) = 1
    )
    insert into wfchat_legacy_guest_targets (
        source_session_id, owner_user_id, target_session_id
    )
    select account.source_session_id, account.owner_user_id, target.id
    from unambiguous_accounts account
    cross join lateral (
        select session.id
        from auth_sessions session
        where session.user_id = account.owner_user_id
          and session.kind in ('registered', 'admin')
        order by (session.revoked_at is null and session.expires_at > now()) desc,
                 session.created_at desc,
                 session.id
        limit 1
    ) target;

    update chats source
    set owner_session_id = target.target_session_id
    from wfchat_legacy_guest_targets target
    where source.owner_session_id = target.source_session_id
      and source.owner_user_id = target.owner_user_id;

    update chat_attachments source
    set owner_session_id = target.target_session_id
    from wfchat_legacy_guest_targets target
    where source.owner_session_id = target.source_session_id
      and source.owner_user_id = target.owner_user_id;

    update memory_items source
    set owner_session_id = target.target_session_id
    from wfchat_legacy_guest_targets target
    where source.owner_session_id = target.source_session_id
      and source.owner_user_id = target.owner_user_id;

    update memory_extraction_jobs source
    set owner_session_id = target.target_session_id
    from wfchat_legacy_guest_targets target
    where source.owner_session_id = target.source_session_id
      and source.owner_user_id = target.owner_user_id;

    update memory_follow_up_deliveries source
    set owner_session_id = target.target_session_id
    from wfchat_legacy_guest_targets target
    where source.owner_session_id = target.source_session_id
      and source.owner_user_id = target.owner_user_id;

    with moved as (
        select source.*, target.target_session_id
        from cafe_progress source
        join wfchat_legacy_guest_targets target
          on target.source_session_id = source.owner_session_id
         and target.owner_user_id = source.owner_user_id
    ), totals as (
        select target_session_id,
               owner_user_id,
               least(sum(cafe_stars), 2147483647)::integer as cafe_stars,
               max(updated_at) as updated_at
        from moved
        where target_session_id is not null
        group by target_session_id, owner_user_id
    ), cosmetics as (
        select moved.target_session_id,
               coalesce(array_agg(distinct cosmetic) filter (where cosmetic is not null), '{}') as unlocked_cosmetics
        from moved
        left join lateral unnest(moved.unlocked_cosmetics) cosmetic on true
        where moved.target_session_id is not null
        group by moved.target_session_id
    )
    insert into cafe_progress (
        owner_session_id, owner_user_id, cafe_stars, unlocked_cosmetics, updated_at
    )
    select totals.target_session_id,
           totals.owner_user_id,
           totals.cafe_stars,
           cosmetics.unlocked_cosmetics,
           totals.updated_at
    from totals
    join cosmetics using (target_session_id)
    on conflict (owner_session_id) do update
    set owner_user_id = excluded.owner_user_id,
        cafe_stars = least(cafe_progress.cafe_stars::bigint + excluded.cafe_stars, 2147483647)::integer,
        unlocked_cosmetics = array(
            select distinct cosmetic
            from unnest(cafe_progress.unlocked_cosmetics || excluded.unlocked_cosmetics) cosmetic
            order by cosmetic
        ),
        updated_at = greatest(cafe_progress.updated_at, excluded.updated_at);

    delete from cafe_progress source
    using wfchat_legacy_guest_targets target
    where source.owner_session_id = target.source_session_id
      and source.owner_user_id = target.owner_user_id;

    with moved as (
        select distinct on (target_session_id)
               target_session_id,
               source.owner_user_id,
               source.equipped_cosmetic,
               source.updated_at
        from cafe_cosmetic_loadouts source
        join wfchat_legacy_guest_targets target
          on target.source_session_id = source.owner_session_id
         and target.owner_user_id = source.owner_user_id
        order by target_session_id, source.updated_at desc, source.owner_session_id desc
    )
    insert into cafe_cosmetic_loadouts (
        owner_session_id, owner_user_id, equipped_cosmetic, updated_at
    )
    select target_session_id, owner_user_id, equipped_cosmetic, updated_at
    from moved
    on conflict (owner_session_id) do update
    set owner_user_id = excluded.owner_user_id,
        equipped_cosmetic = excluded.equipped_cosmetic,
        updated_at = excluded.updated_at
    where excluded.updated_at > cafe_cosmetic_loadouts.updated_at;

    delete from cafe_cosmetic_loadouts source
    using wfchat_legacy_guest_targets target
    where source.owner_session_id = target.source_session_id
      and source.owner_user_id = target.owner_user_id;

    insert into cafe_room_rewards (
        room_id, round_number, owner_session_id, owner_user_id, cafe_stars, created_at
    )
    select source.room_id,
           source.round_number,
           target.target_session_id,
           source.owner_user_id,
           source.cafe_stars,
           source.created_at
    from cafe_room_rewards source
    join wfchat_legacy_guest_targets target
      on target.source_session_id = source.owner_session_id
     and target.owner_user_id = source.owner_user_id
    on conflict (room_id, round_number, owner_session_id) do nothing;

    delete from cafe_room_rewards source
    using wfchat_legacy_guest_targets target
    where source.owner_session_id = target.source_session_id
      and source.owner_user_id = target.owner_user_id;

    insert into sync_entities (
        session_id, owner_user_id, item_id, item_type, updated_at, deleted_at, payload
    )
    select distinct on (target.target_session_id, source.item_id)
           target.target_session_id,
           source.owner_user_id,
           source.item_id,
           source.item_type,
           source.updated_at,
           source.deleted_at,
           source.payload
    from sync_entities source
    join wfchat_legacy_guest_targets target
      on target.source_session_id = source.session_id
     and target.owner_user_id = source.owner_user_id
    order by target.target_session_id, source.item_id, source.updated_at desc
    on conflict (session_id, item_id) do update
    set owner_user_id = excluded.owner_user_id,
        item_type = excluded.item_type,
        updated_at = excluded.updated_at,
        deleted_at = excluded.deleted_at,
        payload = excluded.payload
    where excluded.updated_at > sync_entities.updated_at;

    delete from sync_entities source
    using wfchat_legacy_guest_targets target
    where source.session_id = target.source_session_id
      and source.owner_user_id = target.owner_user_id;

    insert into sync_commits (
        operation_id, session_id, user_id, merged_count, conflict_count, committed_at
    )
    select distinct on (source.operation_id, target.target_session_id)
           source.operation_id,
           target.target_session_id,
           target.owner_user_id,
           source.merged_count,
           source.conflict_count,
           source.committed_at
    from sync_commits source
    join wfchat_legacy_guest_targets target
      on target.source_session_id = source.session_id
    order by source.operation_id, target.target_session_id, source.committed_at desc
    on conflict (operation_id, session_id) do nothing;

    delete from sync_commits source
    using wfchat_legacy_guest_targets target
    where source.session_id = target.source_session_id;

    return candidate_count;
end;
$$;

select wfchat_reparent_legacy_promoted_guests(2147483647);
