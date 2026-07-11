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

`store.rs` owns the internal automatic-memory persistence foundation. It exposes
owner-scoped memory item/source operations, account-promotion merging,
transactional chat-deletion cleanup, durable extraction jobs, atomic captured
item/source writes, bounded owner/character retrieval candidates, and
learned-context reset. `DELETE /api/learned-context` is the only public
automatic-memory route; it deletes learned context for the current owner while
retaining chat history. There is no list, item-management, or retrieval API.

`memory.rs` owns automatic capture and retrieval. The API starts one background
worker in the existing process. It claims durable jobs, requests strict
structured extraction from the configured AI provider, validates evidence and
sensitive-data rules, and commits accepted items with message provenance. For
new chat requests it derives bounded topic signals, requests owner/character
candidates from the store, validates and scores them deterministically, and
builds an untrusted soft-context system message within item/character/token
budgets. Automatic-memory logs contain only bounded operation metadata,
sanitized error codes, and aggregate counters—not raw user or learned content.

`AppState` also owns one dependency-free `MemoryTelemetry` instance shared by
its runtime clones. Process-lifetime atomic counters and stable structured
events summarize capture and retrieval health and prompt-budget usage. They
reset on API restart and are not exposed through a public endpoint or persisted
to PostgreSQL. Telemetry does not contain user content, learned context,
credentials, ownership identifiers, or chat/job identifiers.

```text
persist user + assistant + extraction job (one transaction)
  -> return chat response / SSE done
  -> background memory worker
      -> strict extraction and validation
      -> atomic memory item + message source persistence

latest user text
  -> bounded owner + character candidate query
  -> relevance/confidence/importance/reinforcement/recency scoring
  -> character prompt -> learned-context system message -> chat messages
```

Both chat endpoints call the same `prepare_chat_completion_context()` function,
so streaming and non-streaming provider requests receive identical learned
context. Memory retrieval fails open: the chat proceeds without memory if the
memory-specific query fails.

`memory_evaluation.rs` is the deterministic automatic-memory evaluation suite.
It exercises production selection and prompt preparation with synthetic EN/TH
fixtures and uses the PostgreSQL test database for ownership, character,
reinforcement, correction, expiration, source deletion, and reset/job-state
boundaries without calling a live AI provider. Expiration is enforced by the
bounded candidate query and application validation; there is no background
expiration service.

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

The backend uses PostgreSQL through `sqlx`. Local and deployed environments
should provide `DATABASE_URL`. `ChatStore::connect()` applies embedded SQLx
migrations before the store is returned, so normal request handling starts only
after pending migrations have completed. Migration ownership is tracked in
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

Editable `avatar_url` values are validated before profile updates are stored.
User-supplied avatar URLs must be `https`; `http` is accepted only for
localhost or loopback development URLs. Empty, malformed, `data:`,
`javascript:`, and non-local plain `http` values are rejected.

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
