# Chat Voice

Voice is an optional layer over final text messages. The backend owns providers,
credentials, models, validation, and rate limits; the browser never selects a
provider.

## Assistant Speech

`POST /api/chats/:chat_id/messages/:message_id/speech` accepts no provider
parameters. It verifies chat ownership and synthesizes only a non-empty,
finalized assistant message.

Provider modes:

| `AI_VOICE_PROVIDER` | Behavior |
| --- | --- |
| `disabled` | Hides speech actions |
| `mock` | Returns deterministic WAV for development/tests |
| `openai` | Calls the configured OpenAI speech endpoint |
| `voicevox` | Calls server-side VOICEVOX `/audio_query` then `/synthesis` |

The endpoint has a 10-requests-per-minute in-memory bucket. OpenAI responses may
stream through the same endpoint; VOICEVOX and mock return complete audio bytes.

The frontend allows one playback at a time and exposes loading, playing, stop,
and retry states. Blob playback is the default. Setting
`VITE_ENABLE_STREAMING_SPEECH_PLAYBACK=true` enables the MediaSource path when
the browser and response type support it. Only completed successful audio is
cached, and only for the current browser session.

Playback is user-initiated unless the user enables latest-message auto-play. It
stops on another playback, microphone start, send, clear, chat/persona change,
navigation, or unmount.

## Speech Text Policy And VOICEVOX

`AI_VOICE_SPEECH_TEXT_POLICY` controls the text sent to TTS:

- `original`: use the displayed assistant text.
- `japanese_translation`: derive natural spoken Japanese with the configured
  chat provider, without changing stored or displayed text.

VOICEVOX requires `VOICEVOX_BASE_URL` and `VOICEVOX_SPEAKER_ID`. Optional
`VOICEVOX_*_SCALE` and pre/post phoneme settings modify the audio query.
The backend rejects an unspeakable query or empty, invalid, sample-less, or
silent WAV rather than caching a silent success.

`VOICEVOX_CREDIT` is non-secret attribution shown in Settings. It should name
VOICEVOX and the selected voice according to that voice library's terms.

## Push-To-Talk Transcription

`POST /api/chat/transcription` accepts one multipart field named `file` or
`audio` and returns `{ "text": "..." }` with `Cache-Control: no-store`.

Provider modes:

| `AI_TRANSCRIPTION_PROVIDER` | Behavior |
| --- | --- |
| `disabled` | Hides the microphone action |
| `mock` | Returns deterministic transcript text |
| `openai` | Calls the configured OpenAI transcription endpoint |

The route has a 6-requests-per-minute bucket and a 25 MiB body limit. It rejects
missing, empty, oversized, or unsupported audio and normalizes browser MIME
values for WebM, WAV, MPEG/MP3, MP4/M4A, Ogg, and FLAC. Audio bytes are not
persisted or logged.

Recording is explicit push-to-talk, not realtime streaming. The frontend uses
bounded MediaRecorder chunks, requests a final flush before stopping, and
rejects header-only or too-small recordings. A successful transcript fills the
composer draft and never sends automatically.

Permission, recording, elapsed time, cancel, transcribing, and error state stay
inside the composer. Cancel, send, clear, navigation, or unmount stops tracks,
aborts upload, and invalidates stale transcript results.

## Avatar Motion

Speech drives coarse semantic motion, not audio analysis:

```text
speech loading -> thinking
audio playing  -> talking
end/stop/error -> idle
```

`useAssistantSpeechPlayback` owns audio resources. The chat-session boundary
emits avatar events, and `avatarChatBridge.ts` maps them to renderer-neutral
state. There is no waveform, amplitude, phoneme, viseme, or lip-sync processing.

## Configuration

OpenAI speech:

- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `AI_VOICE_MODEL` (default `gpt-4o-mini-tts`)
- `AI_VOICE_ID` (default `marin`)
- `AI_VOICE_FORMAT` (`mp3` or `wav`)
- `AI_VOICE_INSTRUCTIONS` (optional)

OpenAI transcription:

- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `AI_TRANSCRIPTION_MODEL` (default `gpt-4o-mini-transcribe`)
- `AI_TRANSCRIPTION_PROMPT` (optional)

`OPENAI_MODEL`, `AI_VOICE_MODEL`, and `AI_TRANSCRIPTION_MODEL` target
different endpoints and are not interchangeable.

## Boundaries

- Text appears and persists independently of audio.
- TTS starts only after an assistant message has a stable id.
- Voice never changes `ChatMessage.text`, chat persistence, or SSE events.
- There is no always-on/realtime voice mode, wake word, partial-response TTS,
  persisted audio history, or lip sync.

Implementation lives in `apps/api/src/chat/voice.rs`,
`apps/api/src/voice.rs`, and the two voice hooks under
`apps/web/src/features/chat/hooks/`.
