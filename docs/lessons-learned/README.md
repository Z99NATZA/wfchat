# Lessons Learned

This folder records approaches that were used or seriously attempted and then
caused a bug, regression, confusing UX, security weakness, or operational risk.
Its purpose is to prevent the same failed approach from being introduced again.

This folder does not describe the current system. Current behavior belongs in
`docs/` and must be checked against the implementation and tests before a
current document is changed.

## Reading Order

1. Inspect the code and tests that own the scoped behavior.
2. Read the matching current document in `docs/`.
3. Read only the relevant lesson file in this folder.

## Entry Rules

Each entry must describe a concrete failed approach and its consequence. Do not
describe the replacement, current implementation, current file paths, roadmap,
release version, or status such as `Active` or `Superseded`.

Use this format:

```md
## YYYY-MM-DD - Short problem title

Context:
- What the work was trying to achieve.

Failed approach:
- What the system did.

Problem observed:
- The bug, regression, confusing UX, security weakness, or operational risk.

Root cause:
- Why the approach failed.

Lesson:
- A stable warning that prevents the failed approach from being repeated.
```

Do not add ordinary feature delivery, implementation summaries, test plans,
current contracts, or planned work. Those are not lessons learned.

## File Scope

- `chat-sessions.md`: chat creation, selection, deletion, and route hydration
- `chat-scroll.md`: timeline scrolling and virtualization state
- `chat-streaming.md`: SSE lifecycle and atomic message persistence
- `chat-memory.md`: cross-chat memory behavior that caused incorrect context
- `chat-voice.md`: speech playback and transcription interaction failures
- `backend-auth.md`: session ownership and profile-input security failures
- `backend-persistence.md`: database and migration failure modes
- `shared-buttons.md`: repeated UI control patterns that caused visual drift
