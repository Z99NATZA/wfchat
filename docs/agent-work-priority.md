# Agent Work Priority

Use this file as the first document to read before starting a new scoped agent task.

## Active Scope

No active scoped agent task.

## Required Read Order

When a new priority is set, list the required documents here in the order agents should read them before implementation.

1. `docs/agent-work-priority.md`
2. `docs/architecture.md`
3. Domain documents relevant to the scoped task.

## Notes

- Keep this file short and task-focused.
- `docs/architecture.md` is an architecture index, not the source of detailed behavior.
- Read `docs/behavior-history/*` only for the subsystem being changed, when debugging a regression, or when changing a behavior that has prior decision history.
- When code changes because of a bug, regression, confusing UX, or previously wrong behavior, update the current domain document and add a short behavior history entry for the affected subsystem.
- Move completed milestone details into the relevant domain document.
- Clear this file when the active priority is complete.
