# Chat Voice Behavior History

## 2026-06-25 - Stream uncached assistant speech playback when supported

Status: Active

Previous behavior:
- Assistant speech playback fetched the full audio response as a Blob before
  creating an `HTMLAudioElement`.

Problem observed:
- Real provider TTS responses could not start playback until the whole audio
  response finished downloading, even though the backend and provider can stream
  audio bytes.

Decision:
- Keep the existing speech endpoint and assistant message id contract.
- Stream the backend speech response body for OpenAI TTS when possible.
- On the frontend, use `MediaSource` for supported uncached audio responses so
  playback can start before the response fully downloads.
- Preserve Blob playback fallback and cache only completed successful audio
  responses for session-only replay.

Why:
- This improves first playback latency without changing SSE text rendering,
  persisted message text, manual controls, replay cache semantics, or
  push-to-talk STT.

Regression guard:
- `apps/web/src/features/chat/hooks/useAssistantSpeechPlayback.test.ts` covers
  the MediaSource streaming path and replay cache behavior.
- `apps/api/src/chat.rs` keeps speech endpoint header and mock audio coverage.

Related current contract:
- `docs/chat-voice.md`

Related implementation:
- `apps/api/src/voice.rs`
- `apps/api/src/chat.rs`
- `apps/web/src/features/chat/hooks/useAssistantSpeechPlayback.ts`
- `apps/web/src/features/chat/services/chatApiService.ts`

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
