# Chat Voice Behavior History

## 2026-06-21 - Ignore cleanup errors after successful playback end

Status: Active

Previous behavior:
- Assistant speech cleanup after the audio `ended` event kept the playback token active.

Problem observed:
- Auto-play could play audio successfully, then show the assistant speech failure message under the bubble after completion.

Decision:
- A successful `ended` event invalidates the current playback token before cleanup.
- Any later audio `error` event emitted by clearing playback resources is ignored as stale.

Why:
- Browser audio cleanup can emit follow-up events that do not mean the user's playback failed.
- Successful completion should return the message action to idle without displaying retry/error UI.

Regression guard:
- `apps/web/src/features/chat/hooks/useAssistantSpeechPlayback.test.ts` covers `ended` followed by `error`.

Related current contract:
- `docs/chat-voice.md`

Related implementation:
- `apps/web/src/features/chat/hooks/useAssistantSpeechPlayback.ts`
