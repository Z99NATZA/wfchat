# Agent Work Priority

Use this file as the first document to read before starting a new scoped agent task.

## Active Scope

Planned chat rendering performance work. Implement in separate scopes:

1. Add lazy, non-blocking syntax highlighting for assistant fenced code blocks.
2. Add virtualized chat timeline rendering after syntax highlighting is stable.

## Required Read Order

When a new priority is set, list the required documents here in the order agents should read them before implementation.

1. `docs/agent-work-priority.md`
2. `docs/chat-message-rendering.md`
3. `docs/chat-layout-scroll.md`
4. `docs/mobile-viewport.md`

## Notes

- Keep this file short and task-focused.
- Move completed milestone details into the relevant domain document.
- Clear this file when the active priority is complete.
- Do not implement syntax highlighting and timeline virtualization in the same change unless the user explicitly requests it.
