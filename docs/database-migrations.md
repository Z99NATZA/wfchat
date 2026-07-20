# Database Migrations

Ordered SQL files in `apps/api/migrations/` are the only canonical PostgreSQL
schema source.

## Runtime

`ChatStore::connect()` runs embedded SQLx migrations before the API serves
traffic. Startup fails if migration validation or execution fails. Docker
Compose waits for PostgreSQL health and relies on this API startup path; there
is no separate migration service.

CI provides `WFCHAT_TEST_DATABASE_URL` so `cargo test` applies the same
migrations to a fresh PostgreSQL database.

`apps/api/db/init.sql` is a manual bootstrap helper only. It may be regenerated
from migrations, but schema changes must never be added only there.

## Rules

- Add one new timestamped SQL file for every schema change.
- Never edit a migration after it has run on a shared or deployed database.
- Keep migration files LF-only. SQLx checksums include line-ending bytes;
  `.gitattributes` enforces this path.
- Resolve checksum failures by comparing committed bytes and line endings.
  Never edit `_sqlx_migrations` to hide a mismatch.
- Use expand/backfill/contract migrations when one destructive step would make
  mixed application versions unsafe.
- Review application and migration changes together.
- Keep [Database schema](database-schema.md) aligned at the table/relationship
  level; exact columns, constraints, and indexes remain in SQL.

Migrations are forward-only. PostgreSQL is the only supported database.

## Verification

From the repository root, against a disposable database:

```powershell
$env:WFCHAT_TEST_DATABASE_URL='postgres://postgres:postgres@localhost:5432/wfchat_test'
cargo test --manifest-path apps/api/Cargo.toml
```
