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
- `provider`: backend calls a real TTS adapter using server-owned credentials and configuration.

Current implementation supports `disabled` and `mock` only. Add a real provider
only after playback lifecycle, cancellation, cleanup, and error handling are
stable without committing to OpenAI, ElevenLabs, local TTS, or any other vendor.

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

Do not accept arbitrary provider names, model names, or API keys from the
frontend.

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

## Current Status

Implemented for v1 with:

- backend `AI_VOICE_PROVIDER=disabled|mock`
- chat UI config capability flag for assistant speech playback
- `POST /api/chats/:chat_id/messages/:message_id/speech`
- mock WAV audio generation on the backend
- frontend assistant message speaker action
- one active playback at a time
- loading, playing, stop, retry/error states
- cleanup on stop, chat navigation, and unmount

## Documentation Rules

When implementing voice behavior:

- Update this document first if the current scope changes.
- Add `docs/behavior-history/chat-voice.md` when a voice bug or regression changes behavior.
- Keep `docs/chat-sse-streaming.md` separate unless the work changes SSE protocol or streaming lifecycle.
- Keep `docs/pngtuber.md` separate unless the work adds avatar playback or lip sync.
