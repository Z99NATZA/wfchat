# Database Migrations

Status: planned

This document tracks the intended migration path for WFChat's PostgreSQL schema.
It exists because schema ownership is currently split between
`apps/api/db/init.sql` and startup SQL in `apps/api/src/store.rs`.

## Current State

WFChat currently keeps the database usable through two mechanisms:

- `apps/api/db/init.sql` defines a full schema that can be applied manually or
  through the Docker `db-init` job.
- `Store::migrate()` in `apps/api/src/store.rs` runs idempotent `create table if
  not exists`, `alter table ... add column if not exists`, and
  `create index if not exists` SQL at API startup.

This is acceptable for local development and disposable databases. It becomes
fragile once the project has long-lived data, multiple deployed environments, or
schema changes that need ordering, backfills, or rollback planning.

## Risk

The main risk is schema drift:

- A fresh database created from `init.sql` may not match an upgraded database
  that has only seen startup migration SQL.
- Schema changes can be hard to audit because they are embedded in application
  code.
- Deployment order is unclear when a change needs both a schema migration and
  application code changes.
- Destructive or backfill migrations are difficult to reason about without an
  ordered migration history.

## Target State

Use an ordered migration system as the source of truth.

Recommended default:

- Use `sqlx migrate` because the backend already uses `sqlx`.
- Store migration files under `apps/api/migrations/`.
- Keep migration files append-only after they have been applied to any shared or
  deployed database.
- Run migrations before serving API traffic, either from API startup or the
  deployment process.
- Keep `apps/api/db/init.sql` only as a bootstrap convenience if it remains
  useful for local Docker flows.

## Proposed Rollout

### Phase 1: Baseline Migration

Create the initial migration from the current effective schema.

Suggested file:

```text
apps/api/migrations/202607040001_initial_schema.sql
```

The migration should include the schema currently represented by:

- `apps/api/db/init.sql`
- `Store::migrate()` in `apps/api/src/store.rs`

The baseline migration should be tested against a fresh empty PostgreSQL
database.

### Phase 2: Startup Integration

Replace ad hoc startup schema creation with the migration runner.

Expected behavior:

- API startup applies pending migrations or fails fast with a clear error.
- Failed migrations stop the API from serving traffic.
- Store methods continue to assume the schema exists after startup completes.

### Phase 3: Bootstrap Cleanup

Decide what to do with `apps/api/db/init.sql`.

Recommended options:

- Remove it if `sqlx migrate run` fully replaces the Docker `db-init` path.
- Or keep it as a generated/local bootstrap helper and clearly document that
  migration files are canonical.

Do not maintain two independent schema sources long term.

### Phase 4: Operating Rules

After migration support exists:

- Every schema change gets a new migration file.
- Migrations are reviewed with the application code that depends on them.
- Risky migrations are split into expand/backfill/contract steps when needed.
- CI should run migrations against an empty database before backend tests.
- Release notes should mention whether a release includes database migrations.

## Acceptance Criteria

Migration work is complete when:

- A fresh database can be created only from ordered migration files.
- An existing development database can be upgraded by running the same migration
  command.
- API startup or deployment reliably applies pending migrations before normal
  request handling.
- `database-schema.md` matches the schema produced by migrations.
- Docker documentation points to the migration flow as the canonical path.
- No new schema SQL is added to `Store::migrate()`.

## Non-Goals

This work does not need to introduce:

- Cross-database support beyond PostgreSQL.
- A complex rollback framework.
- Online zero-downtime migration guarantees before the app has production
  traffic that requires them.

Down migrations can be added later if the deployment workflow requires them, but
forward-only migrations are enough for the current project stage.
