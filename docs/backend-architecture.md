# Backend Architecture

The backend is a Rust Axum API in `apps/api`. It is designed to keep common request flows readable in a small number of files.

## Goals

- Chat UI does not know provider or model names.
- API keys stay in backend environment variables only.
- Guest users can chat without logging in.
- Registered users can be added later for sync and recovery.
- Admin-only endpoints are the boundary for provider, model, and AI profile configuration. The current admin API exposes read/status endpoints only and requires an admin session.
- Provider adapters can be added without changing the chat UI contract.

## Request Flow

```text
React
  -> POST /api/chats/:chat_id/messages
    -> chat.rs
      -> ai/mod.rs
        -> ai/providers/<provider>.rs
```

The chat request sends user intent only. Provider and model selection happen inside the backend.

Image attachment support keeps the same boundary. The backend foundation
exposes backend-owned upload, preview, and pending-delete endpoints for local
image files, validates image bytes, stores attachment metadata, checks
session/user ownership, accepts backend-issued attachment ids in chat message
requests, converts validated image attachments into backend-owned AI image
parts, maps OpenAI vision payloads, and links attachments only after successful
assistant completion. The API process also runs backend-owned cleanup for stale
pending image attachments so orphaned upload files do not remain indefinitely. See
`docs/chat-image-attachments.md`.

The streaming path is additive and does not replace the non-streaming endpoint:

```text
React
  -> POST /api/chats/:chat_id/messages/stream
    -> chat.rs
      -> ai/mod.rs
        -> ai/providers/<provider>.rs
      <- text/event-stream
```

See `docs/chat-sse-streaming.md` for the completed first-iteration SSE contract.

Chat voice covers assistant text-to-speech playback and push-to-talk user
speech-to-text input. See `docs/chat-voice.md`; the backend owns voice provider
credentials and must not accept provider names, model names, or API keys from
the chat UI.
The current real TTS provider modes are `AI_VOICE_PROVIDER=openai`, which calls
OpenAI's speech API, and `AI_VOICE_PROVIDER=voicevox`, which calls a
server-side VOICEVOX Engine through `/audio_query` and `/synthesis`. Both use
backend configuration while keeping the frontend speech endpoint contract
unchanged.
The same chat UI config can expose non-secret voice credit text, such as a
VOICEVOX attribution line, but not provider controls, speaker id controls,
model controls, or API keys.
VOICEVOX tuning values such as speed, pitch, intonation, volume, and phoneme
silence scales are also backend-owned environment configuration and are not
normal chat UI controls.
Push-to-talk user speech-to-text is also backend-owned. The chat UI uploads a
completed recording to `POST /api/chat/transcription`; provider selection,
credentials, model selection, and outbound transcription calls stay server-side
through `AI_TRANSCRIPTION_PROVIDER`.

Clear chat flow:

```text
React
  -> DELETE /api/chats/:chat_id/messages
    -> chat.rs
      -> store.rs
```

This clears message history for the current chat while keeping the chat id and guest session.

## Files

`main.rs` starts the process, loads `.env`, configures logging, and binds the HTTP listener.

`app.rs` wires routes and middleware.

`config.rs` reads environment variables into one typed config.

`rate_limit.rs` owns in-memory fixed-window abuse controls for
cost/load-sensitive API endpoint families. Chat send and chat SSE streaming
share one session/IP bucket. Assistant speech, user speech transcription, and
image attachment upload use separate stricter buckets.

`state.rs` stores shared dependencies such as config and the HTTP client.

`error.rs` maps application errors into HTTP responses.

`auth.rs` owns guest sessions, Google login, logout, `GET /api/auth/me`, and editable account profile updates.

`chat.rs` owns chat routes and the main chat flow.

`characters.rs` owns character-facing endpoints, the current static character registry, and character-specific system prompts.

`admin.rs` owns admin-only AI profile and provider endpoints. It currently exposes list/status endpoints protected by `UserKind::Admin`; write/manage flows are not implemented yet.

`ai/mod.rs` owns provider selection and the shared AI message types.

`ai/providers/*.rs` isolates OpenAI, LM Studio, xAI, and Anthropic implementation details.

## Planned Libraries

`axum`, `tokio`, `tower-http`: HTTP API and middleware.

`serde`, `serde_json`: request and response data.

`dotenvy`: local environment files.

`reqwest`: outbound provider API calls.

`thiserror`: application errors.

`tracing`, `tracing-subscriber`: structured logs.

`uuid`: ids for chats, users, sessions, and messages.

The current backend uses PostgreSQL through `sqlx`. Local and deployed
environments should provide `DATABASE_URL`. Database migration ownership and the
planned move away from ad hoc startup schema SQL are tracked in
`docs/database-migrations.md`.

Store methods should propagate PostgreSQL errors as `Result` values instead of
turning unexpected failures into optimistic success, not-found, `false`, or
empty lists. Route handlers should convert expected missing rows into `404 Not
Found` and let real database failures reach the API error boundary as a logged
`500 database error`.

## Rate Limiting

The backend applies in-memory fixed-window rate limits before expensive work on
these endpoint families:

- `POST /api/chats/:chat_id/messages` and
  `POST /api/chats/:chat_id/messages/stream`: 20 requests per minute.
- `POST /api/chats/:chat_id/messages/:message_id/speech`: 10 requests per
  minute.
- `POST /api/chat/transcription`: 6 requests per minute.
- `POST /api/chat/attachments`: 12 requests per minute.

Rate-limit keys prefer the `wfchat_session` cookie, then fall back to
`X-WFChat-Session` for compatibility. If no valid session identifier is
available, the limiter falls back to the client IP reported by `X-Forwarded-For`
or `X-Real-IP`, then to a shared unknown-client bucket. When a bucket is
exceeded, the route returns `429 Too Many Requests` using the normal JSON error
body:

```json
{ "error": "too many requests" }
```

## Auth Model

```text
guest      can chat without login on the same browser/device
registered can chat and sync across browsers/devices through account-scoped ownership
admin      can access admin AI profile/provider endpoints and is the role for future management flows
```

Auth uses the HTTP-only `wfchat_session` cookie as the primary API ownership
boundary. The `X-WFChat-Session` header remains a compatibility fallback for
non-browser or legacy local callers. Frontend code should not store session ids,
API keys, or admin secrets in browser-readable storage.

Google identity and editable app profile are separate:

```text
auth_identities stores provider data such as Google email/name/avatar
user_profiles stores editable display_name/avatar_url used by the app UI
```

On first Google login, the backend seeds `user_profiles` from Google. Later logins update `auth_identities` but do not overwrite custom profile fields.

## AI Profiles

The chat UI sends `chat_id`, `character_id`, message content, and
backend-issued attachment ids for image messages. It should not
send `provider`, `model`, local file paths, user-provided image URLs, or
provider-specific image payloads.

Backend routing should use an AI profile:

```text
character -> ai_profile -> provider/model/settings
```

This is the intended path for letting an admin switch OpenAI, LM Studio, xAI, or Claude without changing chat UI code. The current implementation still reads provider and model settings from backend environment configuration.

## Characters

The active character registry is static code in `apps/api/src/characters.rs`.

Chat UI persona metadata is also sourced from this registry (`status`, `last_message`, `last_active_at`, `unread_count`, `avatar_url`) and exposed through `GET /api/chat-ui/config`. The same config response exposes `quick_prompts`, which the frontend renders as composer chips that fill the draft without sending.

Current character:

```text
aiko -> ai_profile_id: aiko_default
```

Aiko's prompt is intentionally character-specific and provider-independent. It defines her as a calm Japanese anime-style female waifu companion with a subtle girlfriend-like feeling, composed warmth, and light humor.

Prompt language rule:

```text
Reply in the same language as the user's latest message.
If the user mixes languages, follow the dominant language.
If the user explicitly asks for a language, use that language.
```

When adding more companions, add another `Character` entry first. The chat flow should continue to resolve:

```text
character_id -> Character -> ai_profile_id -> provider adapter
```
