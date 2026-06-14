# Agent Work Priority

Use this file as the first document to read before starting a new scoped agent task.

## Active Scope

Chat message rich-format rendering in `apps/web`.

## Required Read Order

When a new priority is set, list the required documents here in the order agents should read them before implementation.

1. `docs/agent-work-priority.md`
2. `docs/frontend-architecture.md`
3. `docs/components.md`
4. `docs/theme.md`
5. `docs/chat-layout-scroll.md`
6. `docs/chat-sse-streaming.md`
7. `docs/chat-message-rendering.md`
8. `docs/chat-message-rendering-test-cases.md`

## Scope Guard

For this active scope, implement only the first iteration described in `docs/chat-message-rendering.md` and verify it against `docs/chat-message-rendering-test-cases.md`. Do not add attachments, message actions, citations, tool cards, Mermaid, math rendering, backend schema changes, SSE changes, quick prompts, search, or composer features unless this file and the rendering document are updated first.

## Notes

- Keep this file short and task-focused.
- Move completed milestone details into the relevant domain document.
- Clear this file when the active priority is complete.
