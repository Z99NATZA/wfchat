# Behavior History

This folder records behavior changes that were made because an earlier
implementation caused a bug, regression, confusing UX, or operational risk.

Use these files as decision memory. They are not the primary source of current
requirements.

## How Agents Should Use This

Read the current domain document first. Read behavior history only when the task
touches that same subsystem, investigates a regression, or proposes changing a
behavior that already has a history entry.

Recommended read order:

1. `docs/architecture.md`
2. The current domain document, such as `docs/chat-layout-scroll.md`
3. The matching behavior history file, such as `docs/behavior-history/chat-scroll.md`

Do not read every history file for ordinary scoped work. Pick the smallest file
that matches the subsystem being changed.

## File Scope

Keep one file per subsystem or behavior family:

- `chat-scroll.md` for chat timeline scrolling, virtualization, jump-to-latest, and active-chat navigation state
- `chat-sse.md` for chat streaming transport, optimistic streaming state, and SSE fallback behavior
- `sync-system.md` for sync flow, stale cached data, tombstones, and conflict behavior
- `backend-persistence.md` for backend store, PostgreSQL persistence, and database error handling decisions
- `shared-buttons.md` for shared non-icon command button styling and button system decisions

Add a new file only when the change does not fit an existing subsystem.

## Entry Format

Use this format for new entries:

```md
## YYYY-MM-DD - Short behavior decision

Status: Active | Superseded | Reverted

Previous behavior:
- What the system used to do.

Problem observed:
- The bug, regression, confusing UX, or risk that made the old behavior unsafe.

Decision:
- What the system should do now.

Why:
- The reasoning that should prevent future agents from reintroducing the old behavior.

Regression guard:
- Tests, QA steps, monitoring, or manual checks that protect the behavior.

Related current contract:
- `docs/<domain-doc>.md`

Related implementation:
- `path/to/file`
```

Keep entries factual and short. If the current requirement changes, update the
domain document first, then add or supersede a history entry here.
