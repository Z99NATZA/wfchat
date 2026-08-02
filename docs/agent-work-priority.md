# Agent Work Priority

Use this file as the first document to read before starting a new scoped agent task.

## Active Scope

No active scoped task.

## Required Read Order

Add task-specific documents here before implementation.

## Required Outcome

Define the task-specific completion criteria here before implementation.

## Authorization And Verification

- Treat `ok impl`, `ok refine`, `ok update docs`, `ok tests`, and `ok ci` as
  standalone authorization commands using the clearly agreed scope.
- Commands may use `: <message>` to identify or narrow scope, such as
  `ok impl: logging`. `ok update: <message>` is the scoped form of
  `ok update docs`. A file path is unnecessary when context identifies it.
- If scope is missing or ambiguous, ask for clarification. Other wording is not
  authorization to modify the repository.
- `ok impl`, `ok refine`, and `ok update docs` authorize scoped repository
  changes. Implementation and refinement include focused tests and fixes for
  failures caused by the active changes.
- Do not run full checks by default. `ok tests` authorizes all local test suites;
  `ok ci` authorizes all local equivalents in `.github/workflows/ci.yml`.
- Reuse valid results. Do not weaken assertions or fix unrelated behavior.
  Report unrelated, pre-existing, skipped, or blocked checks with their reasons.
- These commands do not authorize commits, pushes, pull requests, releases, or
  remote actions.

## Documentation Rules

- Treat code, configuration, migrations, and tests as the source of truth.
- Keep `docs/` limited to current behavior, ownership, boundaries, limits,
  failure handling, and operating commands.
- Update the owning domain document; create a new file only when none exists.
- Lead with the outcome, use only necessary headings, and state each fact once.
- Prefer short paragraphs, compact lists, and tables for repeated mappings.
- Link to authoritative source instead of copying schemas, configuration, or
  test catalogs. Retain exact contracts and safety-critical limits.
- Do not include status labels, implementation journals, milestones, rollout
  plans, open questions, recommendations, or future work.
- Put concrete failed approaches in `docs/lessons-learned/`, version history
  in `docs/release/`, and active task details in this file. Delete other stale
  or duplicated material.
- Before finishing, verify links and repository paths, search for stale
  plan/status language, and run `git diff --check`.

## Notes

- Keep this reusable template. After completing a priority, reset only
  `Active Scope`, `Required Read Order`, and `Required Outcome`.
- Keep this file short and task-focused.
- `docs/architecture.md` is an architecture index, not the source of detailed behavior.
- Read `docs/lessons-learned/*` only for the subsystem being changed, when debugging
  a regression, or before reworking behavior with a known failure mode.
