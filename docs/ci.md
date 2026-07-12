# Continuous Integration

This document defines the intended CI gate for WFChat. Keep this document as the
long-term reference; use `docs/agent-work-priority.md` only for the currently
active implementation task.

## Purpose

Continuous Integration checks whether a pushed commit is still healthy before it
is merged or deployed.

For WFChat, CI should prevent frontend lint warnings, frontend formatting drift,
broken web builds, failing frontend tests, failing API tests, Rust formatting
drift, and Rust lint warnings from reaching protected branches or production
deployment.

CI does not usually block `git push` itself. Instead, it runs after a push or
pull request and reports pass/fail status on the commit.

## Intended Flow

Recommended production flow:

```text
push or pull request
  -> run CI checks
  -> if checks pass, allow merge
  -> if merged to the deployment branch, deploy
```

If a new commit fails CI, the previous deployed version should continue running.
Deployment should only happen after CI passes.

## Required Checks

The root CI workflow runs these checks in this order:

```bash
npm --prefix apps/web run lint
npm --prefix apps/web run format:check
npm --prefix apps/web test
npm --prefix apps/web run build
cargo test --manifest-path apps/api/Cargo.toml
cargo fmt --manifest-path apps/api/Cargo.toml -- --check
cargo clippy --manifest-path apps/api/Cargo.toml -- -D warnings
```

The workflow sets `apps/api` as the API job working directory, so its YAML uses
short forms such as `cargo test` and `cargo fmt --check`. The commands above are
the equivalent forms to use from the repository root.

The API test job should provide a fresh PostgreSQL service and set
`WFCHAT_TEST_DATABASE_URL` so backend tests exercise startup migrations and
database-backed flows.

If a check is intentionally skipped, document the reason in the workflow or in
the implementation notes.

## Local Pre-Push Check

Run the same gates locally before pushing:

```powershell
npm --prefix apps/web run lint
npm --prefix apps/web run format:check
npm --prefix apps/web test
npm --prefix apps/web run build

$env:WFCHAT_TEST_DATABASE_URL='postgres://postgres:postgres@localhost:5432/wfchat_phase2_test'
cargo test --manifest-path apps/api/Cargo.toml
cargo fmt --manifest-path apps/api/Cargo.toml -- --check
cargo clippy --manifest-path apps/api/Cargo.toml -- -D warnings
```

The local PostgreSQL database name may differ, but it must be a disposable test
database rather than production data. GitHub Actions creates a fresh
`wfchat_test` PostgreSQL service for its API job.

## Fixing Common Failures

When frontend formatting fails with `Code style issues found`, apply Prettier
and rerun the frontend gates:

```powershell
npm --prefix apps/web run format
npm --prefix apps/web run lint
npm --prefix apps/web run format:check
npm --prefix apps/web test
npm --prefix apps/web run build
```

Review `git status --short` and `git diff` after automatic formatting because
Prettier may update files beyond the one that first exposed the failure.

When Rust formatting fails, apply Rustfmt and rerun its check:

```powershell
cargo fmt --manifest-path apps/api/Cargo.toml
cargo fmt --manifest-path apps/api/Cargo.toml -- --check
```

When lint or Clippy fails, fix the reported unused imports, warnings, or unsafe
patterns rather than suppressing the gate. The frontend lint script and Rust
Clippy both treat warnings as errors.

## GitHub Actions

GitHub Actions is the preferred default CI runner for this repository unless the
deployment platform requires a different runner.

The workflow should live under:

```text
.github/workflows/
```

Current implementation:

```text
.github/workflows/ci.yml
```

Recommended trigger:

- pull requests targeting the main branch
- pushes to the main branch

## Deployment Relationship

CI and deployment are separate concerns:

- CI checks whether the commit is healthy.
- CD or the deployment platform publishes the commit.

When using platforms such as Vercel, Fly.io, Render, Railway, or Netlify, make
sure deployment is gated by CI or by protected branch rules.

Preferred behavior:

```text
commit A is currently deployed
commit B is pushed
CI for commit B fails
commit B is not deployed
production stays on commit A
```

## Branch Protection

Before accepting outside contributions or depending on automatic production
deployment, configure branch protection for the main branch.

Recommended required checks:

- frontend lint
- frontend formatting
- frontend tests
- frontend production build
- backend tests
- Rust formatting
- Rust clippy

Also consider requiring pull requests before merging to the main branch.
