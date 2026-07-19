# Agent Work Priority

Use this file as the first document to read before starting a new scoped agent task.

## Active Scope

No active scoped task.

## Required Read Order

Add task-specific documents here before implementation.

## Required Outcome

Define the task-specific completion criteria here before implementation.

## Notes

- This file is a reusable task template. Do not delete, collapse, or rewrite the
  template structure when a priority is completed.
- When a priority is completed, clear only task-specific content from
  `Active Scope`, `Required Read Order`, and `Required Outcome`; keep the
  headings, default placeholder text, and these notes for the next agent.
- Keep this file short and task-focused.
- `docs/architecture.md` is an architecture index, not the source of detailed behavior.
- Treat implementation and tests as the source of truth. Before adding or
  changing a current claim in `docs/`, inspect the owning code and relevant
  tests rather than copying an older document.
- Before completing a scoped task, run the full local equivalents of the Web
  and API checks defined in `.github/workflows/ci.yml`. Fix failures caused by
  the task, and report every skipped or blocked check with the reason.
- Keep current domain documents in `docs/` limited to how the system works now.
  Do not preserve previous behavior, migration narrative, replacement history,
  or failed approaches in a current domain document.
- Read `docs/lessons-learned/*` only for the subsystem being changed, when debugging
  a regression, or before reworking behavior with a known failure mode.
- When a bug, regression, confusing UX, security weakness, or operational risk
  reveals a reusable failed approach, add a short entry to the matching
  `docs/lessons-learned/` file. Record the failed approach and lesson only; do not
  describe the replacement or current implementation there.
- Ordinary feature delivery, implementation summaries, current contracts, test
  plans, and roadmap items do not belong in `docs/lessons-learned/`.
- When a milestone completes, put only the resulting current behavior in the
  relevant domain document; do not move milestone narrative into `docs/`.
- Clear only the completed task details when the active priority is complete; keep this template for the next scoped task.
