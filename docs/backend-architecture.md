# Backend Architecture

The Rust/Axum API owns authentication, data ownership, PostgreSQL persistence,
AI providers, file storage, voice, sync, and realtime Cafe state. Browser code
uses `/api/*` and never receives provider credentials.

## Request Shape

```text
Axum router (app.rs)
  -> domain handler
  -> owner resolution from wfchat_session
  -> store and/or provider service
  -> JSON, SSE, audio, image bytes, or WebSocket
```

`AppState` shares typed config, PostgreSQL store, HTTP client, rate limiter,
Cafe hub, and automatic-memory telemetry. `ChatStore::connect()` applies SQLx
migrations before the server starts.

## Domains

| Module | Responsibility |
| --- | --- |
| `auth.rs` | Guest cookie sessions, Google login, logout, current user, profile updates |
| `characters.rs` | Static character registry, UI metadata, and prompts |
| `chat/` | Chat CRUD, message preparation, JSON/SSE sends, attachments, speech |
| `memory.rs` | Background extraction, structured retrieval, follow-ups, reset |
| `cafe.rs` | Lobby API, authoritative in-process rooms, WebSocket protocol |
| `sync.rs` | Generic delta/cache preview, commit, and pull |
| `admin.rs` | Admin-only AI profile/provider status reads |
| `store/` | PostgreSQL operations grouped by domain |
| `ai/` | Provider-neutral messages and provider adapters |
| `voice.rs` | TTS, transcription, VOICEVOX, and speech-text policy |
| `attachments.rs` | Image validation, local storage, and orphan cleanup |

Focused domain contracts live in the linked documents from
[Architecture](architecture.md).

## Authentication And Ownership

The backend creates an HTTP-only `wfchat_session` cookie for guest use.
Registered login reuses the session and associates data with an account owner.
`X-WFChat-Session` is accepted only as a non-browser compatibility fallback.
Frontend code must not persist session ids or secrets in browser-readable
storage.

Google identity data and editable profiles are separate. Profile avatar URLs
must be HTTPS, except localhost/loopback HTTP used during development.
`data:`, `javascript:`, malformed, and public plain-HTTP values are rejected.

## AI Boundary

Chat sends `character_id`, text, timezone, and backend-issued image attachment
ids. Character lookup resolves an `ai_profile_id`; backend environment config
then selects the active provider and model.

Supported chat providers are `mock`, `openai`, `lmstudio`, and `xai`.
Anthropic/Claude code is scaffolded but runtime config rejects it. Image parts
are supported only by mock and OpenAI.

The same prepared context feeds streaming and non-streaming completion:

```text
character prompt
optional automatic memory
current chat history
latest user message and validated image parts
```

AI keys, model ids, provider payloads, and storage paths remain server-side.
Admin endpoints expose read/status information only and require an admin
session.

## Realtime And Background Work

- Chat output uses POST + SSE and commits messages only after successful
  completion.
- Cafe uses WebSocket with server-authoritative movement, interactions, room
  capacity, rewards, and message rate.
- Automatic-memory capture uses a durable PostgreSQL outbox processed by an API
  background worker.
- Stale pending image cleanup runs in the API process.

Cafe rooms and in-process metrics reset with the API process. Chats, account
data, learned context, Cafe progress/loadouts/rewards, and sync data persist in
PostgreSQL.

## Abuse Controls

The in-memory fixed-window limiter uses session identity, falling back to client
IP:

| Family | Limit per minute |
| --- | ---: |
| Chat JSON + SSE sends | 20 |
| Assistant speech | 10 |
| User transcription | 6 |
| Image upload | 12 |

Limits are per API process and reset on restart.

## Configuration

`apps/api/src/config.rs` parses and validates environment configuration at
startup. Unknown providers, missing required keys/models, invalid voice formats,
and invalid attachment limits stop startup with a configuration error.
