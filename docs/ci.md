# Continuous Integration

`.github/workflows/ci.yml` runs on every pull request and pushes to `main`.
It has independent init, Web, API, and Playwright E2E smoke jobs.

## Checks

Environment initialization:

```powershell
npm run test:init
```

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
cargo run --manifest-path apps/api/Cargo.toml --quiet --bin validate-config -- apps/api/.env.example
cargo fmt --manifest-path apps/api/Cargo.toml -- --check
cargo clippy --manifest-path apps/api/Cargo.toml -- -D warnings
```

E2E smoke:

```powershell
npm ci --prefix apps/web
npx --prefix apps/web playwright install chromium
$env:WFCHAT_E2E_DATABASE_URL='postgres://postgres:postgres@localhost:5432/wfchat_e2e'
npm --prefix apps/web run test:e2e:smoke
```

The init job exercises synchronization, migration, preflight, transaction,
rollback, multiline, and idempotency behavior with temporary fixtures. The API
job starts PostgreSQL 16, sets `WFCHAT_TEST_DATABASE_URL`, and therefore tests
migrations and database-backed flows. It also launches a dedicated validator
that clears its inherited environment, loads `apps/api/.env.example`, and runs
the real Rust `Config` validation path. ESLint allows no warnings; Clippy treats
warnings as errors.

The E2E job uses a separate PostgreSQL 16 database and installs Chromium with
its Linux runtime dependencies. Playwright starts the API with mock AI and
disabled voice providers and starts the Vite Web app. Its full-stack smokes
verify that a guest chat survives a browser reload and that a newly created
Cafe room receives a real WebSocket welcome before and after a reload. A
failure uploads Playwright traces and other test results for seven days.

## Local Verification

Run the same commands before push. The init tests do not read or write the
repository's local env files. API tests that need PostgreSQL require a
disposable database:

```powershell
$env:WFCHAT_TEST_DATABASE_URL='postgres://postgres:postgres@localhost:5432/wfchat_test'
cargo test --manifest-path apps/api/Cargo.toml
```

Create a separate disposable `wfchat_e2e` database before running the E2E smoke
command above. Ports `18080` and `4173` must be available; Playwright owns both
processes for the duration of the test. On Linux, install Chromium with its
runtime packages by adding `--with-deps` to the documented install command.

Use Prettier or Rustfmt to fix formatting, then inspect the diff:

```powershell
npm --prefix apps/web run format
cargo fmt --manifest-path apps/api/Cargo.toml
```

Branch protection and deployment configuration are repository-host settings,
not implemented by this workflow. Production deployment should require both CI
code-check jobs and the E2E smoke job to pass.
