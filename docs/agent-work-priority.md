# Agent Work Priority

Use this file as the first document to read before starting a new scoped agent task.

## Active Scope

Implement chat view virtualization/windowing for long conversations.

Goals:

- Keep only visible chat messages plus a modest overscan mounted.
- Keep the scrollbar representing the loaded chat timeline.
- Preserve current bottom auto-scroll, `Jump to latest`, and prepend-anchor behavior.
- Support variable-height Markdown, tables, code blocks, streaming text, and PNGTuber bottom clearance.
- Ensure off-viewport messages do not keep expensive highlight work, observers, or timers alive.

## Required Read Order

When a new priority is set, list the required documents here in the order agents should read them before implementation.

1. `docs/agent-work-priority.md`
2. `docs/chat-layout-scroll.md`
3. `docs/chat-message-rendering.md`
4. `docs/chat-message-rendering-test-cases.md`
5. `docs/mobile-viewport.md`
6. `docs/pngtuber.md`

## Notes

- Keep this file short and task-focused.
- Move completed milestone details into the relevant domain document.
- Clear this file when the active priority is complete.
