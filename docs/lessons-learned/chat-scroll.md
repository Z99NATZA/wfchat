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

## 2026-07-24 - Initial auto-scroll was mistaken for leaving the bottom

Context:
- Restoring a long virtualized chat scrolls against estimated row heights before
  mounted rows report their measured heights.

Failed approach:
- Any scroll event that ended away from the current bottom disabled following,
  even when the event moved downward and came from the initial auto-scroll.

Problem observed:
- A restored long chat could stop above its latest message after measured row
  heights increased the timeline height.

Root cause:
- Bottom-follow state used distance from a changing estimated bottom without
  preserving the initial downward alignment intent.

Lesson:
- Keep following across downward layout and programmatic scroll events. Disable
  following and cancel pending alignment only when upward viewport movement is
  backed by user input.

## 2026-07-24 - A user send inherited stale scroll intent

Context:
- A user could compose and send a new message while viewing an older part of the
  active conversation.

Failed approach:
- The new user message and assistant stream reused the bottom-follow state left
  by the user's earlier upward scroll.

Problem observed:
- The newly sent turn remained below the viewport even though the user had just
  initiated it and did not scroll during the response.

Root cause:
- Starting a send did not establish new intent to view and follow the new turn.

Lesson:
- Re-enable bottom following on the transition into sending. A later upward
  scroll must still cancel following for the rest of that response.

## 2026-07-24 - Final streaming replacement mimicked an upward user scroll

Context:
- Completing a streamed response replaces its local assistant row id with the
  persisted server message id and mounts a newly measured virtual row.

Failed approach:
- Any decrease in `scrollTop` was treated as user intent, including browser
  adjustments caused by replacing estimated and measured row heights.

Problem observed:
- Bottom following could stop just before the final assistant bubble reached its
  complete height.

Root cause:
- Scroll direction alone could not distinguish user input from virtualization
  and layout movement.

Lesson:
- Require recent upward wheel, touch/pointer, scrollbar, or keyboard input before
  an upward scroll event disables following.
