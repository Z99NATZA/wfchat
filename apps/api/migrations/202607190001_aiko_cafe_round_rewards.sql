alter table cafe_room_rewards
    add column round_number integer not null default 1;

alter table cafe_room_rewards
    add constraint cafe_room_rewards_round_number_positive
    check (round_number > 0);

alter table cafe_room_rewards
    drop constraint cafe_room_rewards_pkey;

alter table cafe_room_rewards
    add primary key (room_id, round_number, owner_session_id);
