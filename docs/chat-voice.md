# Chat Voice

This document defines the current voice behavior for chat.

## Current Scope: Assistant Playback And Push-To-Talk Input

The implemented voice scope covers assistant text-to-speech playback and
user-initiated push-to-talk speech-to-text input.

Assistant speech can drive the semantic PNGTuber motion state while audio
playback is active. This is a small UI bridge from
playback lifecycle to avatar runtime state, not audio analysis or lip sync.

Assistant playback behavior:

- Assistant messages can expose a speaker action after the message has final text.
- The action requests speech audio for that assistant message text.
- The frontend plays the returned audio and exposes clear loading, playing, stop, and retry states.
- If the active assistant message belongs to an avatar-bound persona, speech
  playback may set the PNGTuber to `thinking` while loading and `talking` while
  audio is audibly playing.
- Speech playback must return the PNGTuber to `idle` when playback ends, is
  stopped, errors, is interrupted, or chat context changes.
- For uncached playback, the frontend uses Blob playback by default. Setting
  `VITE_ENABLE_STREAMING_SPEECH_PLAYBACK=true` opts into `MediaSource` for
  supported audio responses.
- Playback is user-initiated by default. Optional latest-message auto-play is a
  separate opt-in setting.
- Voice playback must not change the stored `ChatMessage.text` contract.
- Voice playback must not block text rendering, message sending, SSE streaming, or chat navigation.

User speech input behavior:

- The composer can expose a microphone action when backend chat UI config
  reports speech-to-text support.
- Recording is user-initiated push-to-talk only.
- The frontend uploads the completed recording to the backend for
  transcription.
- Browser recordings are flushed in bounded chunks and explicitly flushed again
  before stop. Header-only or otherwise too-small recordings are rejected in the
  composer instead of being uploaded for provider transcription.
- A successful transcript is inserted into the composer draft. It is not stored
  as a chat message until the user sends it.
- The frontend exposes clear permission, recording, cancel, transcribing, and
  retry/error states.
- Recording feedback should be minimal and stay inside the composer input row.
  Prefer compact elapsed time, such as `00:05`, plus a small cancel control
  before the microphone action over a full label outside the input.
- Do not remove visible recording feedback entirely; keep a clear visual state
  and accessible label such as `aria-label="Recording"` for screen readers.
- Speech-to-text must not block normal typed message entry, sending, SSE
  streaming, or chat navigation.

Interruption behavior:

- Assistant playback and push-to-talk input are mutually exclusive at the chat
  UI orchestration layer.
- Starting push-to-talk microphone input stops any current assistant playback
  before microphone permission or recording work continues.
- Sending a new message stops any current assistant playback and cancels any
  active push-to-talk request, recording, or transcription so stale transcript
  results cannot rewrite the next composer draft.
- Clearing the current chat after confirmation stops assistant playback and
  cancels any active push-to-talk flow before the delete request is applied.
- Changing chat context, including selecting another chat, creating a draft
  chat, switching persona, loading local markdown QA messages, navigating away,
  or unmounting chat voice UI, stops playback and releases microphone resources.
- Push-to-talk start is ignored while microphone permission is already
  requesting, recording is active, or transcription is already in flight.
- Stopping a recording requests a final data flush and transcribes exactly that
  completed recording. Canceling a recording or transcription invalidates the
  active token and aborts pending upload work.

## Explicit Non-Goals

Do not include these in the current voice scope:

- always-on voice mode
- wake words or browser-side voice activity detection
- realtime voice conversation
- interrupting an in-flight assistant response with voice
- synthesizing or playing TTS from partial in-flight SSE text before the
  assistant response has final persisted text
- avatar lip sync or viseme generation
- persisted audio files or audio history
- provider/model selection controls in the chat UI
- waveform, amplitude, phoneme, or viseme analysis for assistant playback
- mouth-shape asset switching during assistant playback

## Assistant Speech Avatar Motion

This scope is only a semantic motion bridge:

```text
assistant speech loading -> avatar motionState: thinking
assistant speech playing -> avatar motionState: talking
assistant speech idle/error/stopped/interrupted -> avatar motionState: idle
```

Implementation rules:

- Keep `useAssistantSpeechPlayback` focused on audio lifecycle and resource
  cleanup. It should not import avatar runtime code.
- Let the chat session boundary translate playback state into avatar events,
  because it already knows the active persona, message list, current chat id,
  and interruption lifecycle.
- Route avatar updates through `avatarChatBridge.ts` or an equivalent
  avatar-runtime bridge. Do not make chat message rendering import PNGTuber
  renderer details.
- Use existing semantic runtime state: `motionState: "thinking" | "talking" |
  "idle"` and existing expression inference from the played assistant message
  text when available.
- Keep updates coarse. State should change only when playback enters loading,
  playing, idle, stopped, or error states.
- Do not decode audio, poll playback amplitude, inspect waveform data, request
  provider visemes, or drive React state per animation frame.
- Do not change backend speech endpoints, provider configuration, generated
  audio format, message persistence, or `ChatMessage.text`.
- Do not require the chat overlay to be visible. The avatar runtime can still
  update while the overlay is hidden.

Expected failure behavior:

- If speech loading fails, return the avatar to `idle` or the existing error
  expression path without leaving `talking` active.
- If the user stops playback, sends another message, starts push-to-talk,
  changes chat, changes persona, clears chat, or navigates away, stop playback
  and return avatar motion to `idle`.
- If the assistant speech is replayed from the session-only audio cache, it
  should still drive `talking` while the cached audio plays.

## Current Flow

```text
assistant message final text
  -> user clicks speaker
    -> frontend requests TTS audio from backend, using streaming playback when supported
      -> backend calls configured TTS provider
        <- audio stream, bytes, or a short-lived audio response
    -> frontend plays audio

user holds/toggles microphone
  -> browser records bounded audio after permission grant
    -> user stops or cancels recording
      -> frontend uploads completed audio to backend
        -> backend calls configured transcription provider
          <- transcript text
      -> frontend inserts transcript into composer draft
```

The frontend should treat audio as derived UI state. The canonical message
content remains text.

## Voice Source Policy

Voice source rules:

- The chat UI requests speech for a message; it does not choose the provider, model, voice id, or API key.
- Browser `SpeechSynthesis` should not be the primary implementation path because voice quality and behavior vary across devices and browsers.
- Provider choice should be server-side configuration and should remain invisible to normal chat UI.

Supported provider modes:

- `disabled`: voice playback is unavailable and the UI hides speaker actions.
- `mock`: backend returns deterministic development/test WAV audio so the UI lifecycle can be built without a real provider.
- `openai`: backend calls OpenAI text-to-speech using server-owned credentials and configuration.
- `voicevox`: backend adapter that calls a server-side VOICEVOX Engine
  instance and returns `audio/wav`.

Current playback implementation supports `disabled`, `mock`, `openai`, and
`voicevox`.
Current transcription implementation also supports `disabled`, `mock`, and
`openai`.

## VOICEVOX Speech Policy

VOICEVOX is implemented as a backend-owned voice provider without changing the
chat UI speech endpoint. The current behavior is:

- Aiko keeps replying in chat text using the user's language.
- Assistant message text remains the persisted/displayed `ChatMessage.text`.
- When the user clicks the speaker action, the backend derives a separate
  `speech_text` for TTS.
- For VOICEVOX, `speech_text` can be locked to natural spoken Japanese even
  when the displayed assistant message is Thai, English, or another language.

VOICEVOX configuration:

```text
AI_VOICE_PROVIDER=voicevox
AI_VOICE_SPEECH_TEXT_POLICY=japanese_translation
VOICEVOX_BASE_URL=http://voicevox:50021
VOICEVOX_SPEAKER_ID=...
VOICEVOX_SPEED_SCALE=        # optional
VOICEVOX_PITCH_SCALE=        # optional
VOICEVOX_INTONATION_SCALE=   # optional
VOICEVOX_VOLUME_SCALE=       # optional
VOICEVOX_PRE_PHONEME_LENGTH= # optional
VOICEVOX_POST_PHONEME_LENGTH=# optional
```

Supported speech text policies:

- `original`: synthesize the assistant message text exactly as displayed.
- `japanese_translation`: translate the assistant message into natural spoken
  Japanese before TTS.

Derived speech flow:

```text
assistant final text in the user's language
  -> persisted and displayed unchanged
  -> user clicks speaker
    -> backend resolves the assistant message
    -> backend derives speech_text from AI_VOICE_SPEECH_TEXT_POLICY
      -> japanese_translation calls a backend translation step
      -> original uses message.content directly
    -> backend sends speech_text to the configured TTS provider
      -> VOICEVOX: POST /audio_query, then POST /synthesis
    <- frontend receives audio and plays it
```

Translation rules for `japanese_translation`:

- Translate only for speech generation. Do not alter the stored assistant
  message.
- Use natural spoken Japanese suitable for TTS, not a literal word-by-word
  translation.
- Preserve names, intent, emotional tone, and Aiko's warm companion style.
- Return only Japanese speech text from the translation step.
- Treat Markdown, code blocks, URLs, and tables as spoken content that may need
  summarizing or cleanup before TTS.
- Use the configured text/chat model compatibility rules for translation
  request parameters. For text models that require provider defaults, omit
  unsupported custom parameters such as `temperature` instead of failing speech
  playback.

VOICEVOX adapter rules:

- Backend calls VOICEVOX Engine through `VOICEVOX_BASE_URL`.
- Use `/audio_query?text=...&speaker=...` to create an audio query.
- Treat an `audio_query` without speakable moras as a provider failure instead
  of returning a successful silent audio response. This most often means
  `AI_VOICE_SPEECH_TEXT_POLICY=original` sent non-Japanese text to VOICEVOX;
  use `japanese_translation` for Thai, English, and other non-Japanese chat
  replies.
- Apply optional server-side tuning fields to the `audio_query` before
  synthesis when configured. Supported fields are speed, pitch, intonation,
  volume, and pre/post phoneme silence scales.
- Use `/synthesis?speaker=...` with the audio query JSON body to generate WAV.
- Validate the synthesized WAV before returning it. Empty, invalid, sample-less,
  or fully silent WAV payloads are provider failures and should enter the
  frontend retry/error path, not the session replay cache.
- Return `audio/wav` through the existing speech endpoint.
- Keep VOICEVOX network access server-side; the browser should not call
  VOICEVOX Engine directly.

VOICEVOX attribution rules:

- VOICEVOX usage requires attribution/credit, not a payment credit.
- The selected character or voice library terms also apply because each voice
  can have additional usage requirements.
- The chat timeline does not need a persistent credit label under every message.
- Settings exposes the configured voice credit.
- A minimal credit line should identify both VOICEVOX and the selected voice,
  for example `VOICEVOX: <character name>`.
- `VOICEVOX_CREDIT` can configure the non-secret credit line that the backend
  exposes to the frontend. If it is unset, local development falls back to a
  speaker-id based credit line until the selected voice name is configured.
## Frontend Contract

- Keep voice UI local to assistant message actions or a small feature-local hook.
- Keep high-frequency audio state out of React state. Use React state only for coarse states such as `idle`, `loading`, `playing`, and `error`.
- Allow only one active assistant playback at a time. Starting another message should stop the current audio.
- Stop playback on chat navigation or component unmount.
- Clean up `HTMLAudioElement`, object URLs, abort controllers, and pending requests.
- Default assistant speech playback should download a Blob and play it after
  the response completes because this is the most reliable browser path.
- `MediaSource` streaming playback is available only as an explicit opt-in
  experiment through `VITE_ENABLE_STREAMING_SPEECH_PLAYBACK=true`.
- Keep the existing session-only replay cache behavior. Cache only completed
  successful audio responses; do not cache failed or aborted requests.
- Do not attach audio amplitude, waveform, or lip-sync updates to the chat message render path.
- Speech playback may drive only coarse avatar runtime events from the chat
  session boundary.
- Do not auto-scroll the timeline because audio starts or stops.
- Respect browser autoplay policies by requiring a user gesture for first playback.
- Keep user recording/transcription state local to the composer or a small
  feature-local hook.
- Keep the composer height stable across idle, permission, recording, cancel,
  transcribing, retry, and error states. Recording status belongs inside the
  composer input row as compact `time -> cancel -> microphone` controls instead
  of a separate row below the input.
- Request microphone access only after a user gesture.
- Stop microphone tracks on cancel, successful stop, chat navigation, and
  component unmount.
- Use `MediaRecorder` timeslice flushing and `requestData()` before stop so the
  uploaded blob contains audio frames, not just a WebM header.
- Do not upload recordings that are too small to contain usable audio.
- Upload only a completed push-to-talk recording. Do not stream microphone audio.
- Insert transcript text into the composer draft instead of auto-sending it.
- Coordinate voice interruption from the chat session boundary: assistant
  playback owns audio cleanup, push-to-talk owns microphone/upload cleanup, and
  chat actions call those local cleanup APIs before changing message context.

Playback UI states:

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

- Enforce the assistant-speech rate-limit bucket before resolving the message
  or calling the configured voice provider. Exceeded requests return `429 Too
  Many Requests` with the normal JSON error body.
- Resolve the message by `chat_id` and `message_id`.
- Verify the caller owns the chat/session.
- Allow speech only for assistant messages with non-empty final text.
- Use server-side provider/model configuration.
- Return an audio response with an explicit content type such as `audio/mpeg` or `audio/wav`.
- The speech endpoint may stream the response body without changing the route,
  method, ownership checks, or frontend-visible message contract.
- With `AI_VOICE_PROVIDER=disabled`, chat UI config reports voice playback as unavailable.
- With `AI_VOICE_PROVIDER=mock`, the endpoint returns deterministic `audio/wav` mock audio.
- With `AI_VOICE_PROVIDER=openai`, the endpoint calls OpenAI's speech API and
  streams the configured audio format when possible.
- With `AI_VOICE_PROVIDER=voicevox`, the endpoint derives `speech_text`
  according to server-side speech policy, calls VOICEVOX Engine, and returns
  `audio/wav`. If VOICEVOX cannot derive speakable phonemes or returns unusable
  WAV audio, the endpoint returns a provider error instead of a silent success.

Do not accept arbitrary provider names, model names, or API keys from the
frontend.

OpenAI voice configuration:

- `OPENAI_API_KEY`: required when `AI_VOICE_PROVIDER=openai`
- `OPENAI_BASE_URL`: defaults to `https://api.openai.com/v1`
- `OPENAI_MODEL`: backend text/chat model. It is also used by the
  `japanese_translation` speech-text step when `AI_PROVIDER=openai`; it may be
  a latest text model such as `gpt-5.5`.
- `AI_VOICE_MODEL`: defaults to `gpt-4o-mini-tts`
- `AI_VOICE_ID`: defaults to `marin`
- `AI_VOICE_FORMAT`: app-supported values are `mp3` and `wav`
- `AI_VOICE_INSTRUCTIONS`: optional provider-side voice guidance

`OPENAI_MODEL`, `AI_VOICE_MODEL`, and `AI_TRANSCRIPTION_MODEL` are separate
capability-specific settings. Do not copy the latest text model into the voice
or transcription model fields unless the provider explicitly supports that
model on the target audio endpoint.
The `japanese_translation` speech-text step follows the same text-model
temperature compatibility behavior as normal OpenAI chat requests, so latest
text models that reject custom temperature can still be used as `OPENAI_MODEL`.

Shared voice text configuration:

- `AI_VOICE_SPEECH_TEXT_POLICY`: defaults to `original`; values are `original`
  and `japanese_translation`

VOICEVOX voice configuration:

- `VOICEVOX_BASE_URL`: required when `AI_VOICE_PROVIDER=voicevox`
- `VOICEVOX_SPEAKER_ID`: required when `AI_VOICE_PROVIDER=voicevox`
- `VOICEVOX_CREDIT`: optional non-secret credit line shown in Settings, such as
  `VOICEVOX: <character name>`
- Optional tuning values are applied to `audio_query` before synthesis:
  `VOICEVOX_SPEED_SCALE`, `VOICEVOX_PITCH_SCALE`,
  `VOICEVOX_INTONATION_SCALE`, `VOICEVOX_VOLUME_SCALE`,
  `VOICEVOX_PRE_PHONEME_LENGTH`, and `VOICEVOX_POST_PHONEME_LENGTH`.
  All must be numeric; all except pitch must be non-negative.

Current user speech-to-text endpoint:

```text
POST /api/chat/transcription
```

Request behavior:

- Enforce the user-transcription rate-limit bucket before reading the multipart
  audio body or calling the configured transcription provider. Exceeded
  requests return `429 Too Many Requests` with the normal JSON error body.
- Verify or create the caller's session.
- Accept a multipart audio file field named `file` or `audio`.
- Reject missing, empty, or oversized audio.
- Normalize supported audio content types before forwarding to the transcription
  provider, for example `audio/webm;codecs=opus` to `audio/webm`.
- Use server-side transcription provider/model configuration.
- Return JSON `{ "text": "..." }` and `Cache-Control: no-store`.
- Include safe upload metadata in provider-error diagnostics, such as filename,
  normalized content type, byte length, and leading-byte signature. Do not log or
  persist the audio payload.
- With `AI_TRANSCRIPTION_PROVIDER=disabled`, chat UI config reports voice input
  as unavailable.
- With `AI_TRANSCRIPTION_PROVIDER=mock`, the endpoint returns deterministic mock
  transcript text.
- With `AI_TRANSCRIPTION_PROVIDER=openai`, the endpoint calls OpenAI's
  transcription API using server-owned credentials and configuration.

OpenAI transcription configuration:

- `OPENAI_API_KEY`: required when `AI_TRANSCRIPTION_PROVIDER=openai`
- `OPENAI_BASE_URL`: defaults to `https://api.openai.com/v1`
- `AI_TRANSCRIPTION_MODEL`: defaults to `gpt-4o-mini-transcribe`
- `AI_TRANSCRIPTION_PROMPT`: optional provider-side transcription guidance

## Performance Rules

- Text rendering must remain immediate. TTS is an optional enhancement after text exists.
- Streaming TTS must remain separate from SSE text generation. Do not request
  speech until an assistant message has final text and a stable message id.
- Do not run audio decoding, waveform analysis, or lip-sync work in the chat render path.
- Keep generated audio bounded by message length limits or provider limits.
- Prefer request cancellation when the user stops playback before audio is ready.
- Keep caching session-only and derived from completed successful playback
  requests.

## Failure Handling

The UI should handle:

- unsupported browser audio playback
- backend/provider errors
- request cancellation
- chat navigation during a pending request
- audio decode/playback failure
- message no longer existing or no longer owned by the session
- cleanup after normal audio completion must not surface as a playback failure

Failures should not alter the message text or break normal chat actions.

## Capability Summary

The current implementation includes:

- backend `AI_VOICE_PROVIDER=disabled|mock|openai|voicevox`
- chat UI config capability flag for assistant speech playback
- `POST /api/chats/:chat_id/messages/:message_id/speech`
- mock WAV audio generation on the backend
- OpenAI text-to-speech adapter on the backend
- VOICEVOX text-to-speech adapter on the backend
- streaming response body support for OpenAI text-to-speech on the existing
  speech endpoint
- server-side voice model, voice id, audio format, and instructions configuration
- server-side VOICEVOX base URL and speaker id configuration
- server-side VOICEVOX tuning configuration for speed, pitch, intonation,
  volume, and pre/post phoneme silence scales
- server-side `AI_VOICE_SPEECH_TEXT_POLICY=original|japanese_translation`
- frontend assistant message speaker action
- app-level Settings voice credits for VOICEVOX attribution
- one active playback at a time
- loading, playing, stop, retry/error states
- Blob playback by default, with opt-in `MediaSource` playback for uncached
  supported audio
- visible assistant-message-local feedback when speech playback fails
- session-only replay cache for generated speech audio
- user setting to show or hide assistant speech playback actions
- optional user setting to auto-play the latest final assistant message
- cleanup on stop, chat navigation, and unmount
- assistant speech playback motion bridge for PNGTuber loading, playing,
  stopped, and error states
- backend tests for voice provider configuration, adapter behavior, and speech
  endpoint headers
- backend `AI_TRANSCRIPTION_PROVIDER=disabled|mock|openai`
- `POST /api/chat/transcription`
- OpenAI speech-to-text adapter on the backend
- server-side transcription model and prompt configuration
- frontend push-to-talk microphone action in the composer
- composer-local permission, recording, cancel, transcribing, retry/error, and
  cleanup states
- voice interruption semantics for assistant playback, push-to-talk input,
  message send, clear chat, chat context changes, and unmount cleanup
- frontend guard against uploading header-only or too-small microphone
  recordings
- minimal, input-inline composer recording feedback with compact elapsed time,
  a small cancel control, and accessible recording status
- normalized transcription upload content types for browser-generated audio
- safe provider-error diagnostics for transcription upload metadata
- transcript insertion into the composer draft without auto-sending
