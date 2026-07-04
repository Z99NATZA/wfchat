# Database Migrations

Status: implemented

This document tracks WFChat's PostgreSQL migration policy. Ordered migration
files under `apps/api/migrations/` are the canonical schema source.

## Current State

WFChat applies embedded SQLx migrations during API startup through
`ChatStore::connect()`.

Current migration files:

- `apps/api/migrations/202607040001_initial_schema.sql`

`apps/api/db/init.sql` is retained only as a legacy/manual bootstrap helper. Do
not treat it as canonical, and do not add new schema changes there unless it is
being regenerated from migrations.

## Risk

The migration system exists to avoid schema drift:

- A fresh database created from `init.sql` may not match an upgraded database
  that has seen ordered migrations.
- Schema changes can be hard to audit because they are embedded in application
  code.
- Deployment order is unclear when a change needs both a schema migration and
  application code changes.
- Destructive or backfill migrations are difficult to reason about without an
  ordered migration history.

## Target State

Use ordered SQLx migrations as the source of truth.

- Store migration files under `apps/api/migrations/`.
- Keep migration files append-only after they have been applied to any shared or
  deployed database.
- Run migrations before serving API traffic.
- Fail API startup if a migration fails.
- Keep `apps/api/db/init.sql` only as a non-canonical convenience if it remains
  useful.

## Implementation

The baseline migration is:

```text
apps/api/migrations/202607040001_initial_schema.sql
```

It includes:

- current table definitions
- current indexes
- compatibility `alter table ... add column if not exists` statements for
  existing local databases
- existing owner backfills for registered-user account data

`Store::migrate()` has been removed. `ChatStore::connect()` now calls the SQLx
migration runner before returning a usable store.

Docker Compose no longer runs a separate `db-init` service. The API container
waits for PostgreSQL to be healthy, then applies embedded migrations during API
startup.

CI starts a PostgreSQL service for the API job and sets
`WFCHAT_TEST_DATABASE_URL`, so `cargo test` exercises the migration path against
a fresh database.

## Operating Rules

- Every future schema change gets a new migration file.
- Migrations are reviewed with the application code that depends on them.
- Risky migrations are split into expand/backfill/contract steps when needed.
- CI should run migrations against an empty database before backend tests.
- Release notes should mention whether a release includes database migrations.

## Acceptance Criteria

Migration work is complete when:

- A fresh database can be created only from ordered migration files.
- An existing development database can be upgraded by running the same migration
  command.
- API startup applies pending migrations before normal request handling.
- `database-schema.md` matches the schema produced by migrations.
- Docker documentation points to the migration flow as the canonical path.
- No schema SQL is embedded in store startup code.

## Non-Goals

This work does not need to introduce:

- Cross-database support beyond PostgreSQL.
- A complex rollback framework.
- Online zero-downtime migration guarantees before the app has production
  traffic that requires them.

Down migrations can be added later if the deployment workflow requires them, but
forward-only migrations are enough for the current project stage.
