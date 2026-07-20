# Continuous Integration

`.github/workflows/ci.yml` runs on every pull request and pushes to `main`.
It has independent web and API jobs.

## Checks

Web:

```powershell
npm ci --prefix apps/web
npm --prefix apps/web run lint
npm --prefix apps/web run format:check
npm --prefix apps/web test
npm --prefix apps/web run build
```

API:

```powershell
cargo test --manifest-path apps/api/Cargo.toml
cargo fmt --manifest-path apps/api/Cargo.toml -- --check
cargo clippy --manifest-path apps/api/Cargo.toml -- -D warnings
```

The API job starts PostgreSQL 16, sets `WFCHAT_TEST_DATABASE_URL`, and therefore
tests migrations and database-backed flows. ESLint allows no warnings; Clippy
treats warnings as errors.

## Local Verification

Run the same commands before push. API tests that need PostgreSQL require a
disposable database:

```powershell
$env:WFCHAT_TEST_DATABASE_URL='postgres://postgres:postgres@localhost:5432/wfchat_test'
cargo test --manifest-path apps/api/Cargo.toml
```

Use Prettier or Rustfmt to fix formatting, then inspect the diff:

```powershell
npm --prefix apps/web run format
cargo fmt --manifest-path apps/api/Cargo.toml
```

Branch protection and deployment configuration are repository-host settings,
not implemented by this workflow. Production deployment should require both CI
jobs to pass.
