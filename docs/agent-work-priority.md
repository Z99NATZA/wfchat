# Agent Work Priority

Use this file as the first document to read before starting a new scoped agent task.

## Active Scope

Implement lazy, non-blocking syntax highlighting for assistant fenced code blocks.

Out of scope for this priority:

- virtualized chat timeline rendering
- backend message schema changes
- rendering raw assistant HTML

## Required Read Order

When a new priority is set, list the required documents here in the order agents should read them before implementation.

1. `docs/agent-work-priority.md`
2. `docs/chat-message-rendering.md`
3. `docs/chat-message-rendering-test-cases.md`
4. `docs/chat-layout-scroll.md`

## Notes

- Keep this file short and task-focused.
- Move completed milestone details into the relevant domain document.
- Clear this file when the active priority is complete.
- Render plain code immediately and enhance with highlighting only after async work completes.
- Do not highlight inline code or actively streaming assistant code in the first implementation.
- Keep syntax highlighting and timeline virtualization in separate changes.
