alter table cafe_cosmetic_loadouts
    add column equipped_avatar text not null default 'boy';

alter table cafe_cosmetic_loadouts
    add constraint cafe_cosmetic_loadouts_equipped_avatar_check
    check (equipped_avatar in ('boy', 'girl'));
