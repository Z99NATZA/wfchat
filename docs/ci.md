# Continuous Integration

This document defines the intended CI gate for WFChat. Keep this document as the
long-term reference; use `docs/agent-work-priority.md` only for the currently
active implementation task.

## Purpose

Continuous Integration checks whether a pushed commit is still healthy before it
is merged or deployed.

For WFChat, CI should prevent broken web builds, failing frontend tests, failing
API tests, Rust formatting drift, and Rust lint warnings from reaching protected
branches or production deployment.

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

The root CI workflow should run these commands:

```bash
npm --prefix apps/web test
npm --prefix apps/web run build
cargo test --manifest-path apps/api/Cargo.toml
cargo fmt --check
cargo clippy --manifest-path apps/api/Cargo.toml -- -D warnings
```

If a check is intentionally skipped, document the reason in the workflow or in
the implementation notes.

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

- frontend tests
- frontend production build
- backend tests
- Rust formatting
- Rust clippy

Also consider requiring pull requests before merging to the main branch.
