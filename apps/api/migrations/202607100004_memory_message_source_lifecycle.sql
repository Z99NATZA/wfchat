alter table memory_sources
    drop constraint memory_sources_message_id_fkey;

alter table memory_sources
    add constraint memory_sources_message_id_fkey
    foreign key (message_id) references chat_messages(id) on delete cascade;
