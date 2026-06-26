# Chat Voice Behavior History

## 2026-06-26 - Add backend VOICEVOX speech with Japanese speech text policy

Status: Active

Previous behavior:
- Assistant speech playback supported `disabled`, `mock`, and `openai`.
- The speech endpoint synthesized the displayed assistant message text directly.

Decision:
- Add `AI_VOICE_PROVIDER=voicevox` behind the existing speech endpoint.
- Keep the chat UI provider-agnostic; normal chat screens still do not expose
  provider, speaker id, model, or API key controls.
- Add `AI_VOICE_SPEECH_TEXT_POLICY=original|japanese_translation`.
- For `japanese_translation`, derive Japanese `speech_text` only when speech is
  requested, then pass that derived text to the configured TTS provider.
- Call VOICEVOX Engine server-side through `/audio_query` and `/synthesis` and
  return `audio/wav`.

Why:
- Aiko can keep text replies in the user's language while voice playback uses
  natural spoken Japanese for VOICEVOX.
- The existing manual playback, stop/retry states, session-only replay cache,
  and push-to-talk STT contract stay unchanged.

Regression guard:
- `apps/api/src/config.rs` validates the new provider and speech text policy.
- `apps/api/src/voice.rs` covers VOICEVOX request mapping and speech text
  translation policy without calling a real provider.

Related current contract:
- `docs/chat-voice.md`

Related implementation:
- `apps/api/src/voice.rs`
- `apps/api/src/config.rs`
- `apps/api/src/chat.rs`
- `docker-compose.yml`

## 2026-06-25 - Gate MediaSource speech streaming behind an opt-in flag

Status: Active

Previous behavior:
- The default uncached assistant speech path attempted `MediaSource` streaming
  playback when the browser reported support.

Problem observed:
- In the first chat of a browser session, the first speaker click could fetch
  speech successfully with `200 OK` but remain silent. Clicking the same
  message again played from the completed Blob cache.

Decision:
- Keep backend streaming support on the existing speech endpoint.
- Use the stable Blob playback path by default on the frontend.
- Leave the `MediaSource` streaming playback path available only when
  `VITE_ENABLE_STREAMING_SPEECH_PLAYBACK=true` is explicitly enabled.

Why:
- Voice v1 should prioritize reliable manual playback over lower first-byte
  playback latency. A first-click silent playback is worse than waiting for the
  Blob response to complete.

Regression guard:
- `apps/web/src/features/chat/hooks/useAssistantSpeechPlayback.test.ts` covers
  default Blob playback even when `MediaSource` exists.

Related implementation:
- `apps/web/src/features/chat/hooks/useAssistantSpeechPlayback.ts`

## 2026-06-25 - Pre-arm streaming speech playback on click

Status: Active

Previous behavior:
- The streaming speech playback path waited for the speech fetch response before
  calling `HTMLAudioElement.play()`.

Problem observed:
- On the first assistant response in a newly created chat, the speech request
  could return `200 OK` but produce no audible playback. Later speech playback
  attempts in the same session worked.

Decision:
- For the `MediaSource` streaming path, create the audio element and call
  `play()` immediately from the speaker-button click path, before awaiting the
  speech request.
- Keep the visible state as `loading` until the first audio bytes are appended
  and playback is actually ready.
- Preserve Blob fallback and session-only replay cache behavior.

Why:
- Some browsers require media playback to be initiated while the user's click
  activation is still current. Waiting for the network response can lose that
  activation on the first uncached playback.

Regression guard:
- `apps/web/src/features/chat/hooks/useAssistantSpeechPlayback.test.ts` verifies
  `play()` is called before the speech request resolves.

Related current contract:
- `docs/chat-voice.md`

Related implementation:
- `apps/web/src/features/chat/hooks/useAssistantSpeechPlayback.ts`

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
