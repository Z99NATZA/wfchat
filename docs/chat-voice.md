# Chat Voice

This document scopes voice features for chat. It is not an active work item by
itself; use it to keep future implementation narrow and staged.

## Current Scope: Assistant Playback And Push-To-Talk Input

The implemented voice scope covers assistant text-to-speech playback and
user-initiated push-to-talk speech-to-text input.

Assistant playback behavior:

- Assistant messages can expose a speaker action after the message has final text.
- The action requests speech audio for that assistant message text.
- The frontend plays the returned audio and exposes clear loading, playing, stop, and retry states.
- For uncached playback, the frontend may stream supported audio responses
  through `MediaSource` so playback can begin before the full audio response is
  downloaded.
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
- Speech-to-text must not block normal typed message entry, sending, SSE
  streaming, or chat navigation.

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

These can be planned as separate follow-up scopes after playback and
push-to-talk input are stable.

## Recommended Flow

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
- `voicevox`: planned backend adapter that calls a server-side VOICEVOX Engine
  instance and returns `audio/wav`.

Current playback implementation supports `disabled`, `mock`, and `openai`.
Current transcription implementation also supports `disabled`, `mock`, and
`openai`.

## Planned VOICEVOX Speech Policy

VOICEVOX should be added as a backend-owned voice provider without changing the
chat UI speech endpoint. The first target behavior is:

- Aiko keeps replying in chat text using the user's language.
- Assistant message text remains the persisted/displayed `ChatMessage.text`.
- When the user clicks the speaker action, the backend derives a separate
  `speech_text` for TTS.
- For VOICEVOX, `speech_text` can be locked to natural spoken Japanese even
  when the displayed assistant message is Thai, English, or another language.

Recommended first VOICEVOX configuration:

```text
AI_VOICE_PROVIDER=voicevox
AI_VOICE_SPEECH_TEXT_POLICY=japanese_translation
VOICEVOX_BASE_URL=http://voicevox:50021
VOICEVOX_SPEAKER_ID=...
```

Recommended future speech text policies:

- `original`: synthesize the assistant message text exactly as displayed.
- `japanese_translation`: translate the assistant message into natural spoken
  Japanese before TTS.
- `same_language`: synthesize in the assistant message language when the voice
  provider supports it.
- `character_default`: use the character's configured voice language, such as
  Japanese for Aiko.
- `user_preference`: use a user/app setting layered on top of server and
  character defaults.

The initial implementation can be server-configured only. Do not add chat UI
provider, speaker, model, or API key controls. If a user-facing setting is added
later, expose it as a voice language or speech style preference, not as raw
provider configuration.

Recommended derived speech flow:

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

VOICEVOX adapter rules:

- Backend calls VOICEVOX Engine through `VOICEVOX_BASE_URL`.
- Use `/audio_query?text=...&speaker=...` to create an audio query.
- Optionally adjust query fields such as speed, pitch, intonation, or volume
  from server-side config.
- Use `/synthesis?speaker=...` with the audio query JSON body to generate WAV.
- Return `audio/wav` through the existing speech endpoint.
- Keep VOICEVOX network access server-side; the browser should not call
  VOICEVOX Engine directly.

VOICEVOX attribution rules:

- VOICEVOX usage requires attribution/credit, not a payment credit.
- Check the selected character or voice library terms before release because
  each voice can have additional usage requirements.
- The chat timeline does not need a persistent credit label under every message.
- Prefer an app-level Credits/About page or a Settings credits section.
- A minimal credit line should identify both VOICEVOX and the selected voice,
  for example `VOICEVOX: <character name>`.
- If the app later exports or shares generated audio/video, include the
  required VOICEVOX and character credit with that output or its description.

Future backend cache keys should include the derived speech inputs, for example:

```text
chat_id + message_id + provider + voice_or_speaker_id + speech_text_policy + source_text_hash
```

This avoids replaying stale audio if the displayed text, voice provider,
speaker, or speech policy changes.

## Frontend Contract

- Keep voice UI local to assistant message actions or a small feature-local hook.
- Keep high-frequency audio state out of React state. Use React state only for coarse states such as `idle`, `loading`, `playing`, and `error`.
- Allow only one active assistant playback at a time in the first iteration. Starting another message should stop the current audio.
- Stop playback on chat navigation or component unmount.
- Clean up `HTMLAudioElement`, object URLs, abort controllers, and pending requests.
- Default assistant speech playback should download a Blob and play it after
  the response completes because this is the most reliable browser path.
- `MediaSource` streaming playback is available only as an explicit opt-in
  experiment through `VITE_ENABLE_STREAMING_SPEECH_PLAYBACK=true`.
- Keep the existing session-only replay cache behavior. Cache only completed
  successful audio responses; do not cache failed or aborted requests.
- Do not attach audio amplitude, waveform, or lip-sync updates to the chat message render path.
- Do not auto-scroll the timeline because audio starts or stops.
- Respect browser autoplay policies by requiring a user gesture for first playback.
- Keep user recording/transcription state local to the composer or a small
  feature-local hook.
- Request microphone access only after a user gesture.
- Stop microphone tracks on cancel, successful stop, chat navigation, and
  component unmount.
- Use `MediaRecorder` timeslice flushing and `requestData()` before stop so the
  uploaded blob contains audio frames, not just a WebM header.
- Do not upload recordings that are too small to contain usable audio.
- Upload only a completed push-to-talk recording. Do not stream microphone audio
  in this milestone.
- Insert transcript text into the composer draft instead of auto-sending it.

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
- The speech endpoint may stream the response body without changing the route,
  method, ownership checks, or frontend-visible message contract.
- With `AI_VOICE_PROVIDER=disabled`, chat UI config reports voice playback as unavailable.
- With `AI_VOICE_PROVIDER=mock`, the endpoint returns deterministic `audio/wav` mock audio.
- With `AI_VOICE_PROVIDER=openai`, the endpoint calls OpenAI's speech API and
  streams the configured audio format when possible.
- With planned `AI_VOICE_PROVIDER=voicevox`, the endpoint should derive
  `speech_text` according to server-side speech policy, call VOICEVOX Engine,
  and return `audio/wav`.

Do not accept arbitrary provider names, model names, or API keys from the
frontend.

OpenAI voice configuration:

- `OPENAI_API_KEY`: required when `AI_VOICE_PROVIDER=openai`
- `OPENAI_BASE_URL`: defaults to `https://api.openai.com/v1`
- `AI_VOICE_MODEL`: defaults to `gpt-4o-mini-tts`
- `AI_VOICE_ID`: defaults to `marin`
- `AI_VOICE_FORMAT`: app-supported values are `mp3` and `wav`
- `AI_VOICE_INSTRUCTIONS`: optional provider-side voice guidance

Planned shared voice text configuration:

- `AI_VOICE_SPEECH_TEXT_POLICY`: defaults to `original`; planned values include
  `original` and `japanese_translation`

Planned VOICEVOX voice configuration:

- `VOICEVOX_BASE_URL`: required when `AI_VOICE_PROVIDER=voicevox`
- `VOICEVOX_SPEAKER_ID`: required when `AI_VOICE_PROVIDER=voicevox`
- Optional future tuning: speed, pitch, intonation, volume, and pre/post
  phoneme silence scales

Current user speech-to-text endpoint:

```text
POST /api/chat/transcription
```

Request behavior:

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

## Follow-Up Scopes

Plan each as a separate scoped change:

1. Session-only replay cache for generated audio.
2. Optional auto-play setting for the latest assistant message.
3. Voice interruption semantics.
4. Avatar lip sync from playback audio or provider visemes.
5. VOICEVOX provider with Japanese speech text policy.

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
   - Done for provider configuration validation, OpenAI adapter request/response
     mapping, provider error handling, and speech endpoint response headers.
   - Test invalid provider values.
   - Test missing required API key/model/voice settings.
   - Test provider request/response mapping without calling the real network.
   - Test the speech endpoint still returns explicit audio content type and
     `Cache-Control: no-store`.

3. Manually verify real TTS playback end to end.
   - Done with `AI_VOICE_PROVIDER=openai` after backend tests passed.
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
   - Done with an in-memory frontend cache for the current page/session lifetime.
   - Generated audio files are not persisted.
   - Replaying the same assistant message in the same chat reuses cached audio.
   - Failed and aborted speech requests are not cached.

6. Add a user setting to show or hide assistant voice playback.
   - Done as a frontend preference layered on top of backend capability.
   - If the backend reports speech unavailable, the speaker action stays hidden
     regardless of user preference.

7. Add optional auto-play for the latest assistant message.
   - Done as a frontend preference layered on top of backend capability and
     assistant speech visibility.
   - It is opt-in and disabled by default.
   - Respect browser autoplay policy; manual user interaction may be required
     before auto-play can work reliably.
   - It runs after sending finishes and only targets final assistant messages,
     not streaming placeholders.

8. Add push-to-talk speech-to-text as a separate milestone.
   - Done as the voice milestone after verified assistant TTS playback.
   - Done with a backend-owned transcription adapter and composer-local
     recording/transcription UI.
   - Uses the microphone composer button as the entry point when backend config
     reports transcription support.
   - Handle permission denial, recording cancel, upload failure, and
     transcription failure.
   - Keep transcription provider credentials server-side.
   - Manually verified end to end with `AI_TRANSCRIPTION_PROVIDER=openai` after
     correcting local microphone device input.

9. Consider realtime voice only after TTS and push-to-talk STT are stable.
   - Design this separately from SSE chat streaming.
   - Prefer WebSocket or WebRTC only when bidirectional low-latency behavior is
     actually required.

10. Add streaming TTS playback after SSE text behavior is stable.
   - Done as a playback transport change after the SSE text lifecycle was
     already documented as implemented.
   - Keeps the existing speech endpoint, message id contract, manual playback
     controls, session-only replay cache, and push-to-talk STT behavior.
   - Backend streams OpenAI speech responses through the existing route when
     possible; mock audio remains deterministic WAV bytes.
   - Frontend uses `MediaSource` for supported uncached audio responses and
     falls back to Blob playback when streaming is unavailable.
   - Does not synthesize partial SSE text, add interruption semantics, add
     WebRTC, or add realtime voice conversation.

11. Add VOICEVOX speech output with Japanese speech text policy.
   - Add `AI_VOICE_PROVIDER=voicevox` behind the existing speech endpoint.
   - Add `AI_VOICE_SPEECH_TEXT_POLICY=original|japanese_translation`.
   - Keep displayed assistant text in the user's language.
   - For `japanese_translation`, derive Japanese `speech_text` only when speech
     audio is requested.
   - Call VOICEVOX Engine server-side through `/audio_query` and `/synthesis`.
   - Return `audio/wav` and preserve existing manual playback, retry, stop, and
     replay cache behavior.
   - Do not add provider controls to the normal chat UI in the first pass.

## Current Status

Implemented for v1 with:

- backend `AI_VOICE_PROVIDER=disabled|mock|openai`
- chat UI config capability flag for assistant speech playback
- `POST /api/chats/:chat_id/messages/:message_id/speech`
- mock WAV audio generation on the backend
- OpenAI text-to-speech adapter on the backend
- streaming response body support for OpenAI text-to-speech on the existing
  speech endpoint
- server-side voice model, voice id, audio format, and instructions configuration
- frontend assistant message speaker action
- one active playback at a time
- loading, playing, stop, retry/error states
- frontend streaming playback for uncached supported audio through
  `MediaSource`, with Blob playback fallback
- visible assistant-message-local feedback when speech playback fails
- session-only replay cache for generated speech audio
- user setting to show or hide assistant speech playback actions
- optional user setting to auto-play the latest final assistant message
- cleanup on stop, chat navigation, and unmount
- backend tests for voice provider configuration, adapter behavior, and speech
  endpoint headers
- manually verified OpenAI TTS playback end to end
- backend `AI_TRANSCRIPTION_PROVIDER=disabled|mock|openai`
- `POST /api/chat/transcription`
- OpenAI speech-to-text adapter on the backend
- server-side transcription model and prompt configuration
- frontend push-to-talk microphone action in the composer
- composer-local permission, recording, cancel, transcribing, retry/error, and
  cleanup states
- frontend guard against uploading header-only or too-small microphone
  recordings
- normalized transcription upload content types for browser-generated audio
- safe provider-error diagnostics for transcription upload metadata
- transcript insertion into the composer draft without auto-sending
- manually verified OpenAI STT end to end with real microphone input

## Documentation Rules

When implementing voice behavior:

- Update this document first if the current scope changes.
- Add `docs/behavior-history/chat-voice.md` when a voice bug or regression changes behavior.
- Keep `docs/chat-sse-streaming.md` separate unless the work changes SSE protocol or streaming lifecycle.
- Keep `docs/pngtuber.md` separate unless the work adds avatar playback or lip sync.
