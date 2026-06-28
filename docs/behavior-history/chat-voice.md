# Chat Voice Behavior History

## 2026-06-28 - Keep push-to-talk recording UI layout-stable

Status: Active

Previous behavior:
- The composer could show an inline recording label while push-to-talk was
  active.
- That label could change the chat input height or shift nearby controls when
  recording started.

Decision:
- Keep visible recording feedback, but make it minimal and layout-stable.
- Keep recording feedback inside the composer input row instead of adding a
  separate status row below the input.
- While recording, render compact controls in the order `time`, small `cancel`,
  `microphone`, `image`, `send`.
- Preserve accessibility with an accessible label for the recording state even
  when the visible UI is compact.

Why:
- Users need clear confirmation that microphone recording is active.
- The chat composer should not jump or reflow when recording starts because it
  makes the input feel unstable.

Regression guard:
- `apps/web/src/features/chat/components/ChatComposer.test.tsx` verifies compact
  elapsed recording feedback, the small inline cancel control, and no extra
  idle speech status row.

Related current contract:
- `docs/chat-voice.md`

Related implementation:
- `apps/web/src/features/chat/components/ChatComposer.tsx`
- `apps/web/src/features/chat/components/ChatComposer.test.tsx`

## 2026-06-27 - Define chat voice interruption semantics

Status: Active

Previous behavior:
- Assistant playback could continue while the user started push-to-talk input,
  sent a new message, or cleared the chat.
- Push-to-talk had UI guards for requesting and transcribing states, but rapid
  repeated toggles could still rely on React render timing.

Decision:
- Stop assistant playback before starting push-to-talk microphone input.
- Stop assistant playback and cancel active push-to-talk work when sending a new
  message, clearing chat after confirmation, or changing chat context.
- Keep assistant playback cleanup in the playback hook and microphone/upload
  cleanup in the transcription hook; orchestrate the interruption calls from
  the chat session hook.
- Track push-to-talk status in a ref as well as React state so repeated toggles
  during requesting, recording, or transcribing cannot start overlapping
  recordings.

Why:
- Voice UI should have one active foreground audio action at a time.
- New chat actions should not leave stale playback or delayed transcription
  results attached to a changed conversation or composer draft.

Regression guard:
- `apps/web/src/features/chat/hooks/useChatSession.test.ts` covers interruption
  for starting push-to-talk, sending a message, and clearing chat.
- `apps/web/src/features/chat/hooks/useUserSpeechTranscription.test.ts` covers
  ignored repeated starts while microphone permission or transcription is in
  flight.

Related current contract:
- `docs/chat-voice.md`

Related implementation:
- `apps/web/src/features/chat/hooks/useChatSession.ts`
- `apps/web/src/features/chat/hooks/useUserSpeechTranscription.ts`

## 2026-06-26 - Add server-side VOICEVOX tuning configuration

Status: Active

Previous behavior:
- VOICEVOX used the `audio_query` JSON returned by the engine without applying
  app-level tuning overrides.
- Tuning was documented only as optional future work.

Decision:
- Add optional backend-owned env configuration for VOICEVOX speed, pitch,
  intonation, volume, and pre/post phoneme silence scales.
- Apply only configured tuning values to the VOICEVOX `audio_query` JSON before
  calling `/synthesis`.
- Keep tuning out of the normal chat UI along with provider, speaker, model,
  and API key controls.

Why:
- VOICEVOX voices often need small server-side adjustments to fit the app
  character, but exposing raw provider controls in chat would break the existing
  provider boundary.

Regression guard:
- `apps/api/src/config.rs` validates optional numeric tuning config.
- `apps/api/src/voice.rs` covers both default no-tuning behavior and configured
  tuning values in the synthesis request body.

Related current contract:
- `docs/chat-voice.md`

Related implementation:
- `apps/api/src/config.rs`
- `apps/api/src/voice.rs`
- `docker-compose.yml`

## 2026-06-26 - Show VOICEVOX attribution in app settings

Status: Active

Previous behavior:
- VOICEVOX attribution requirements were documented but not surfaced in the app
  UI.

Decision:
- Add backend-owned non-secret `VOICEVOX_CREDIT` metadata.
- Expose only voice credit text through `/api/chat-ui/config`; do not expose
  provider controls, speaker id controls, model controls, or API keys.
- Show configured voice credits in the app Settings assistant voice section,
  not under every chat message.

Why:
- VOICEVOX requires attribution, and Settings is an app-level place that does
  not clutter the chat timeline.
- Keeping this as backend-owned metadata preserves the normal chat UI boundary.

Regression guard:
- `apps/api/src/chat.rs` covers VOICEVOX credit metadata and absence of raw
  provider control fields.
- `apps/web/src/components/settings/AppSettingsDialog.test.tsx` covers credit
  rendering without controls.

Related current contract:
- `docs/chat-voice.md`

Related implementation:
- `apps/api/src/chat.rs`
- `apps/api/src/config.rs`
- `apps/web/src/app/App.tsx`
- `apps/web/src/components/settings/AppSettingsDialog.tsx`

## 2026-06-26 - Fail VOICEVOX speech when generated audio would be silent

Status: Active

Previous behavior:
- VOICEVOX could return `200 OK` from `/audio_query` and `/synthesis` even when
  non-Japanese `speech_text` produced no usable phonemes.
- The speech endpoint could then return a successful `audio/wav` response that
  the browser played as silence and cached for the page session.

Problem observed:
- With `AI_VOICE_SPEECH_TEXT_POLICY=original`, Thai assistant text sent
  directly to VOICEVOX produced `No phoneme` warnings and silent playback.

Decision:
- Validate VOICEVOX `audio_query` before synthesis. An audio query without
  speakable moras is a provider failure.
- Validate synthesized WAV responses before returning them. Empty, invalid,
  sample-less, or fully silent WAV payloads are provider failures.
- Keep frontend behavior unchanged: provider failures enter the existing
  assistant-message retry/error state and are not added to the session replay
  cache.

Why:
- A visible retry/error state is more actionable than a successful silent Blob.
- `AI_VOICE_SPEECH_TEXT_POLICY=japanese_translation` remains the recommended
  VOICEVOX configuration for Thai, English, and other non-Japanese displayed
  replies.

Regression guard:
- `apps/api/src/voice.rs` covers VOICEVOX audio queries without moras and
  silent WAV payloads.

Related current contract:
- `docs/chat-voice.md`

Related implementation:
- `apps/api/src/voice.rs`

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
