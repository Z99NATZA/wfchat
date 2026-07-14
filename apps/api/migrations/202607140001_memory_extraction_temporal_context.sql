alter table memory_extraction_jobs
    add column user_timezone text not null default 'UTC';

alter table memory_extraction_jobs
    add constraint memory_extraction_jobs_timezone_valid check (
        length(user_timezone) between 1 and 64
        and user_timezone ~ '^[A-Za-z0-9_+.-]+(/[A-Za-z0-9_+.-]+)*$'
    );
