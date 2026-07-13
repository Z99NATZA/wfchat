# Chat Scroll Lessons Learned

## 2026-06-20 - Timeline state leaked across active chats

Context:
- A virtualized message list remained mounted while users switched chats.

Failed approach:
- Scroll offsets, measured row heights, hidden optimistic messages, menus, copy
  state, and unseen counters were reused after the active chat changed.

Problem observed:
- A newly selected chat could open away from its latest message or inherit stale
  UI state from a different conversation.

Root cause:
- Transient timeline state was scoped to the component lifetime instead of the
  conversation identity.

Lesson:
- Do not carry chat-specific timeline or virtualization state across an active
  chat identity change.
