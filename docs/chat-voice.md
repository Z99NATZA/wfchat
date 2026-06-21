# Chat Voice

This document scopes voice features for chat. It is not an active work item by
itself; use it to keep future implementation narrow and staged.

## Current Scope: AI Voice Playback Only

The first voice iteration adds text-to-speech playback for assistant messages
only.

Target behavior:

- Assistant messages can expose a speaker action after the message has final text.
- The action requests speech audio for that assistant message text.
- The frontend plays the returned audio and exposes clear loading, playing, stop, and retry states.
- Playback is user-initiated in the first iteration. Do not auto-play new assistant messages yet.
- Voice playback must not change the stored `ChatMessage.text` contract.
- Voice playback must not block text rendering, message sending, SSE streaming, or chat navigation.

## Explicit Non-Goals For First Scope

Do not include these in the first voice iteration:

- user microphone capture
- speech-to-text
- always-on voice mode
- wake words or browser-side voice activity detection
- realtime voice conversation
- interrupting an in-flight assistant response with voice
- streaming TTS chunks during SSE
- avatar lip sync or viseme generation
- persisted audio files or audio history
- provider/model selection controls in the chat UI

These can be planned as separate follow-up scopes after AI playback is stable.

## Recommended Flow

```text
assistant message final text
  -> user clicks speaker
    -> frontend requests TTS audio from backend
      -> backend calls configured TTS provider
        <- audio bytes or a short-lived audio response
    -> frontend plays audio
```

The frontend should treat audio as derived UI state. The canonical message
content remains text.

## Voice Source Policy

The first implementation should not require choosing a real TTS vendor. Build
the API and UI lifecycle against a backend-owned TTS adapter boundary first.

Voice source rules:

- The chat UI requests speech for a message; it does not choose the provider, model, voice id, or API key.
- Browser `SpeechSynthesis` should not be the primary implementation path because voice quality and behavior vary across devices and browsers.
- A real provider can be added later behind the same backend adapter boundary.
- Provider choice should be server-side configuration and should remain invisible to normal chat UI.

Recommended provider modes:

- `disabled`: voice playback is unavailable and the UI hides speaker actions.
- `mock`: backend returns deterministic development/test WAV audio so the UI lifecycle can be built without a real provider.
- `openai`: backend calls OpenAI text-to-speech using server-owned credentials and configuration.

Current implementation supports `disabled`, `mock`, and `openai`.

## Frontend Contract

- Keep voice UI local to assistant message actions or a small feature-local hook.
- Keep high-frequency audio state out of React state. Use React state only for coarse states such as `idle`, `loading`, `playing`, and `error`.
- Allow only one active assistant playback at a time in the first iteration. Starting another message should stop the current audio.
- Stop playback on chat navigation or component unmount.
- Clean up `HTMLAudioElement`, object URLs, abort controllers, and pending requests.
- Do not attach audio amplitude, waveform, or lip-sync updates to the chat message render path.
- Do not auto-scroll the timeline because audio starts or stops.
- Respect browser autoplay policies by requiring a user gesture for first playback.

Suggested first UI states:

- `idle`: speaker action is available
- `loading`: TTS request is in flight
- `playing`: audio is currently playing and a stop action is available
- `error`: playback failed and retry is available

## Backend Contract

The backend should own provider credentials, provider selection, request
validation, and outbound TTS calls.

Current endpoint:

```text
POST /api/chats/:chat_id/messages/:message_id/speech
```

Request behavior:

- Resolve the message by `chat_id` and `message_id`.
- Verify the caller owns the chat/session.
- Allow speech only for assistant messages with non-empty final text.
- Use server-side provider/model configuration.
- Return an audio response with an explicit content type such as `audio/mpeg` or `audio/wav`.
- With `AI_VOICE_PROVIDER=disabled`, chat UI config reports voice playback as unavailable.
- With `AI_VOICE_PROVIDER=mock`, the endpoint returns deterministic `audio/wav` mock audio.
- With `AI_VOICE_PROVIDER=openai`, the endpoint calls OpenAI's speech API and returns the configured audio format.

Do not accept arbitrary provider names, model names, or API keys from the
frontend.

OpenAI voice configuration:

- `OPENAI_API_KEY`: required when `AI_VOICE_PROVIDER=openai`
- `OPENAI_BASE_URL`: defaults to `https://api.openai.com/v1`
- `AI_VOICE_MODEL`: defaults to `gpt-4o-mini-tts`
- `AI_VOICE_ID`: defaults to `marin`
- `AI_VOICE_FORMAT`: app-supported values are `mp3` and `wav`
- `AI_VOICE_INSTRUCTIONS`: optional provider-side voice guidance

## Performance Rules

- Text rendering must remain immediate. TTS is an optional enhancement after text exists.
- Do not run audio decoding, waveform analysis, or lip-sync work in the chat render path.
- Keep generated audio bounded by message length limits or provider limits.
- Prefer request cancellation when the user stops playback before audio is ready.
- Add caching only after measuring repeated generation cost. Start with no persistence or session-only frontend reuse.

## Failure Handling

The UI should handle:

- unsupported browser audio playback
- backend/provider errors
- request cancellation
- chat navigation during a pending request
- audio decode/playback failure
- message no longer existing or no longer owned by the session

Failures should not alter the message text or break normal chat actions.

## Follow-Up Scopes

Plan each as a separate scoped change:

1. Session-only replay cache for generated audio.
2. Optional auto-play setting for the latest assistant message.
3. Streaming TTS after SSE text behavior is stable.
4. User voice input through push-to-talk speech-to-text.
5. Voice interruption semantics.
6. Avatar lip sync from playback audio or provider visemes.

## Recommended Next Work Sequence

Do not implement all voice follow-ups in one large change. Build one scoped
step at a time and verify the app before moving to the next step. This keeps
provider configuration, playback behavior, user settings, microphone capture,
and realtime transport risks separate.

1. Add a real backend TTS provider behind the existing speech endpoint.
   - Done for OpenAI with the frontend contract unchanged.
   - Server-side provider/model/voice configuration is available.
   - Required provider secrets are validated at API startup.
   - `disabled` and `mock` remain supported.

2. Add backend tests for real-provider configuration and adapter behavior.
   - Test invalid provider values.
   - Test missing required API key/model/voice settings.
   - Test provider request/response mapping without calling the real network.
   - Test the speech endpoint still returns explicit audio content type and
     `Cache-Control: no-store`.

3. Manually verify real TTS playback end to end.
   - Start the API with the real voice provider enabled.
   - Send a chat message, wait for the assistant's final persisted response,
     then click the assistant speaker action.
   - Confirm playback, stop, retry, provider failure, and chat navigation do
     not break normal chat.

4. Improve frontend speech failure feedback.
   - Keep the UI small and local to assistant message actions.
   - Preserve the existing loading, playing, stop, and retry states.
   - Avoid moving provider details or API keys into the frontend.

5. Add session-only replay cache for generated speech.
   - Cache only for the current browser session/page lifetime.
   - Do not persist generated audio files yet.
   - Verify replaying the same assistant message does not call TTS again.
   - Keep cleanup on stop, chat navigation, and unmount.

6. Add a user setting to show or hide assistant voice playback.
   - Treat this as a frontend preference layered on top of backend capability.
   - If the backend reports speech unavailable, keep the speaker action hidden
     regardless of user preference.

7. Add optional auto-play for the latest assistant message.
   - Keep it opt-in and disabled by default.
   - Respect browser autoplay policy; manual user interaction may be required
     before auto-play can work reliably.
   - Only auto-play final assistant messages, not streaming placeholders.

8. Add push-to-talk speech-to-text as a separate milestone.
   - Use the disabled microphone composer button as the eventual entry point.
   - Handle permission denial, recording cancel, upload failure, and
     transcription failure.
   - Keep transcription provider credentials server-side.

9. Consider realtime voice only after TTS and push-to-talk STT are stable.
   - Design this separately from SSE chat streaming.
   - Prefer WebSocket or WebRTC only when bidirectional low-latency behavior is
     actually required.

## Current Status

Implemented for v1 with:

- backend `AI_VOICE_PROVIDER=disabled|mock|openai`
- chat UI config capability flag for assistant speech playback
- `POST /api/chats/:chat_id/messages/:message_id/speech`
- mock WAV audio generation on the backend
- OpenAI text-to-speech adapter on the backend
- server-side voice model, voice id, audio format, and instructions configuration
- frontend assistant message speaker action
- one active playback at a time
- loading, playing, stop, retry/error states
- visible assistant-message-local feedback when speech playback fails
- cleanup on stop, chat navigation, and unmount

## Documentation Rules

When implementing voice behavior:

- Update this document first if the current scope changes.
- Add `docs/behavior-history/chat-voice.md` when a voice bug or regression changes behavior.
- Keep `docs/chat-sse-streaming.md` separate unless the work changes SSE protocol or streaming lifecycle.
- Keep `docs/pngtuber.md` separate unless the work adds avatar playback or lip sync.
