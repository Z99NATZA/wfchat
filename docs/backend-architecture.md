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

`AppState` shares typed config, PostgreSQL store, timeout-bound HTTP client,
request, generation, and image-decode limiters, Cafe hub, and automatic-memory telemetry.
`ChatStore::connect()` applies SQLx migrations before the server starts.

## Domains

| Module           | Responsibility                                                             |
| ---------------- | -------------------------------------------------------------------------- |
| `auth.rs`        | Guest cookie sessions, Google login, logout, current user, profile updates |
| `characters.rs`  | Static character registry, UI metadata, and prompts                        |
| `chat/`          | Chat CRUD, message preparation, JSON/SSE sends, attachments, speech        |
| `memory.rs`      | Background extraction, structured retrieval, follow-ups, reset             |
| `cafe.rs`        | Lobby API, authoritative in-process rooms, WebSocket protocol              |
| `sync.rs`        | Generic delta/cache preview, commit, and pull                              |
| `admin.rs`       | Admin-only AI profile/provider status reads                                |
| `store/`         | PostgreSQL operations grouped by domain                                    |
| `ai/`            | Provider-neutral messages and provider adapters                            |
| `voice.rs`       | TTS, transcription, VOICEVOX, and speech-text policy                       |
| `attachments.rs` | Image validation, local storage, and orphan cleanup                        |

Focused domain contracts live in the linked documents from
[Architecture](architecture.md).

## Authentication And Ownership

The backend creates an HTTP-only `wfchat_session` cookie for guest use. Sessions
expire server-side. Google login requires an active guest session, migrates its
supported data, issues a new registered session, and revokes the old session.
Logout rotates an active registered/admin session to one replacement guest in a
transaction; missing, invalid, already-revoked, and guest sessions cannot mint a
replacement. Unknown client-selected ids never create that requested session.

Guest admission is process-local. `/api/auth/guest` and the session-creation
path of `/api/auth/me` share resolved-IP and global fixed-window limits. Every
other profile, follow-up, learned-context, sync, and Cafe handler requires an
existing active session. Every 10 minutes the API reparents legacy promoted
account rows to a matching registered session, then deletes at most 1,000
expired or revoked guest sessions. Rows without a matching registered target
are retained; registered sessions and their account-owned data are not cleanup
targets.

Production cookies are always `Secure`. `X-WFChat-Session` is a configurable
development compatibility fallback and is rejected in production. Frontend
code must not persist session ids or secrets in browser-readable storage.

Google identity data and editable profiles are separate. Profile avatar URLs
must be HTTPS, except localhost/loopback HTTP used during development.
`data:`, `javascript:`, malformed, and public plain-HTTP values are rejected.
Registered and admin profile updates emit a bounded success audit; missing,
inactive, Guest, or invalid-input updates emit a bounded rejection event. These
events contain no account identifiers or profile values.

## AI Boundary

Chat sends `character_id`, text, timezone, and backend-issued image attachment
ids. Character lookup resolves an `ai_profile_id`; backend environment config
then selects the active provider and model.

Supported chat providers are `mock`, `openai`, `lmstudio`, and `xai`.
Image parts are supported only by mock and OpenAI.

The same prepared, bounded context feeds streaming and non-streaming
completion:

```text
character prompt
optional automatic memory
current chat history
latest user message and validated image parts
```

Message size, JSON body size, recent context messages/characters, provider
request tokens, guarded output characters, connect/total/idle timeouts, and
concurrent generations are server-configured. `CHAT_OUTPUT_MAX_TOKENS` is sent
to supporting providers; `CHAT_OUTPUT_MAX_CHARS` is the provider-neutral hard
limit enforced before JSON persistence and before each SSE chunk is sent. AI
keys, model ids, provider payloads, storage paths, and raw provider errors remain
server-side. Admin endpoints expose read/status information only and require an
admin session.

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

The in-memory fixed-window limiter checks all identities for one request under
one lock. Chat creation and JSON/SSE sends use session, resolved client IP, and global identities;
image upload, assistant speech, and transcription use session and resolved
client IP without the global identity.

The socket peer is the client IP unless `TRUST_PROXY_HEADERS=true`, the peer is
inside `TRUSTED_PROXY_CIDRS`, and one valid `X-Forwarded-For` header contains an
untrusted address. Trusted chains are walked right to left; malformed, multiple,
empty, or all-trusted chains fall back to the normalized peer. Other forwarded
headers are ignored.

| Family                         |                Limit per minute |
| ------------------------------ | ------------------------------: |
| Guest session admission        | 10 per resolved IP, 60 globally |
| Chat creation + JSON/SSE sends | 20 per session/IP, 120 globally |
| Assistant speech               |                              10 |
| User transcription             |                               6 |
| Image upload                   |                              12 |

Rate limits and concurrency limits are per API process and reset on restart.
Image decode capacity is fail-fast and defaults to two blocking decodes; a full
decode semaphore returns `429`. Rate-limited HTTP responses include
`Retry-After: 60`.

Cafe WebSocket admission is reserved atomically before upgrade and defaults to
2 active sockets per session, 32 per resolved IP, and 512 per process. The
session allowance includes one reconnect overlap. Actual Cafe room creation
uses a separate shared 10-minute limiter with defaults of 5 per session, 30 per
resolved IP, and 300 per process; joining or reusing a room is not charged.
Creation-limit responses use `Retry-After: 600`. Both controls use the same
trusted-proxy client-IP resolver as the other API abuse boundaries.

Cafe frames and assembled WebSocket messages are capped at 16 KiB. Empty Cafe
rooms retain reconnect state for 2 minutes, never-joined rooms expire after 10
minutes, and a 30-second process worker removes expired rooms and limiter
buckets. Empty rooms own no movement tick. One structured aggregate every 60
seconds reports Cafe room/socket gauges, message counts, outgoing bytes,
rejections, and reliable lag without logging individual movement updates.

Production chat generation also uses PostgreSQL daily admission. Registered
accounts and Guest sessions each receive 50 successfully committed assistant
replies per `Asia/Bangkok` calendar day. A separate shared circuit breaker
allows 2,000 provider-started chat generations per Bangkok day across all API
instances. Owner and global allowance are reserved atomically after the
short-window and generation-capacity checks. An owner reservation is released
when no assistant reply commits; a global reservation is released only when
provider work never reaches its durable started state. Development follows the
same send path with daily admission disabled.
Chat creation, TTS, transcription, and automatic-memory provider work do not
enter either daily chat-generation counter.

Each quota admission transaction also runs one bounded retention pass. A pass
deletes at most 500 terminal reservation rows from Bangkok dates before the
current date, then deletes at most 500 eligible owner counters and 500 eligible
global counters. Reserved owner/global states keep the corresponding past-day
counter and reservation available for stale recovery; in particular, a
provider-started reservation with reserved owner use is never treated as
terminal. Partial date/state indexes and `FOR UPDATE SKIP LOCKED` keep request
work bounded and allow concurrent API instances to drain the backlog safely
over repeated admissions.

The Guest boundary is deliberately best-effort because replacing browser state
can create a new server session; resolved-IP controls remain only the temporary
shared-network safeguard.

## Configuration

`apps/api/src/config.rs` parses and validates environment configuration at
startup. `APP_ENV=production` additionally requires HTTPS DNS origins outside
the closed local/reserved-name list, rejects IP literals, disables the
compatibility session header, and enforces the documented chat safety maxima.
Invalid CIDRs, trusted headers without a trusted CIDR, unknown providers,
missing required keys/models, invalid voice formats, and invalid limits stop
startup with a configuration error rather than a runtime panic.

Production accepts each positive request, generation, attachment, and storage
limit only up to these maxima. Development keeps the same positive, relational,
and no-panic validation but does not apply this maxima table:

| Key                                     | Default | Production maximum |
| --------------------------------------- | ------: | -----------------: |
| `CHAT_MESSAGE_MAX_CHARS`                |   4,000 |             16,000 |
| `CHAT_REQUEST_MAX_BYTES`                |  65,536 |            262,144 |
| `CHAT_CONTEXT_MAX_MESSAGES`             |      40 |                200 |
| `CHAT_CONTEXT_MAX_CHARS`                |  32,000 |            200,000 |
| `CHAT_OUTPUT_MAX_TOKENS`                |   1,024 |              8,192 |
| `CHAT_OUTPUT_MAX_CHARS`                 |  16,384 |             65,536 |
| `CHAT_AI_CONNECT_TIMEOUT_SECONDS`       |      10 |                 30 |
| `CHAT_AI_IDLE_TIMEOUT_SECONDS`          |      20 |                120 |
| `CHAT_AI_TOTAL_TIMEOUT_SECONDS`         |      60 |                300 |
| `CHAT_MAX_CONCURRENT_GENERATIONS`       |       8 |                128 |
| `CHAT_MAX_CONCURRENT_PER_SESSION`       |       2 |                  8 |
| `AUTH_GUEST_REQUESTS_PER_MINUTE`        |      10 |                 10 |
| `AUTH_GUEST_GLOBAL_REQUESTS_PER_MINUTE` |      60 |                 60 |
| `CHAT_REQUESTS_PER_MINUTE`              |      20 |                 20 |
| `CHAT_GLOBAL_REQUESTS_PER_MINUTE`       |     120 |                120 |
| `CHAT_REGISTERED_DAILY_QUOTA`           |      50 |                 50 |
| `CHAT_GUEST_DAILY_QUOTA`                |      50 |                 50 |
| `CHAT_GLOBAL_DAILY_GENERATION_LIMIT`    |   2,000 |              2,000 |
| `CHAT_MAX_CHATS_PER_OWNER`              |      50 |                 50 |
| `CHAT_MAX_MESSAGES_PER_CHAT`            |     100 |                100 |
| `CHAT_MAX_STORED_CHARS_PER_CHAT`        | 500,000 |            500,000 |
| `CHAT_ATTACHMENT_MAX_BYTES`                  | 10 MiB |             10 MiB |
| `CHAT_ATTACHMENT_MAX_IMAGES_PER_MESSAGE`     |      4 |                  4 |
| `CHAT_ATTACHMENT_MAX_WIDTH`                  |  8,192 |              8,192 |
| `CHAT_ATTACHMENT_MAX_HEIGHT`                 |  8,192 |              8,192 |
| `CHAT_ATTACHMENT_MAX_PIXELS`                 | 20,000,000 |      20,000,000 |
| `CHAT_ATTACHMENT_DECODER_MAX_ALLOC_BYTES`    | 128 MiB |           128 MiB |
| `CHAT_ATTACHMENT_MAX_CONCURRENT_DECODES`     |      2 |                  4 |
| `CHAT_ATTACHMENT_MAX_TOTAL_BYTES_PER_MESSAGE` | 20 MiB |            20 MiB |
| `CHAT_ATTACHMENT_MAX_STORAGE_BYTES_PER_OWNER` | 200 MiB |          200 MiB |
| `CAFE_MAX_SOCKETS_PER_SESSION`                 |      2 |                  2 |
| `CAFE_MAX_SOCKETS_PER_IP`                      |     32 |                 32 |
| `CAFE_MAX_SOCKETS_GLOBAL`                      |    512 |                512 |
| `CAFE_ROOM_CREATIONS_PER_SESSION`              |      5 |                  5 |
| `CAFE_ROOM_CREATIONS_PER_IP`                   |     30 |                 30 |
| `CAFE_ROOM_CREATIONS_GLOBAL`                   |    300 |                300 |
| `CAFE_WEBSOCKET_MAX_BYTES`                     | 16,384 |             16,384 |
| `CAFE_NEVER_JOINED_TTL_SECONDS`                 |    600 |                600 |
| `CAFE_EMPTY_ROOM_TTL_SECONDS`                   |    120 |                120 |
| `CAFE_CLEANUP_INTERVAL_SECONDS`                 |     30 |                 30 |
| `CAFE_TELEMETRY_INTERVAL_SECONDS`               |     60 |                 60 |

Production permits lower Cafe admission and payload limits.
`CAFE_ROOM_CREATION_WINDOW_SECONDS` defaults to 600 and cannot be lower in
production. The never-joined TTL, empty-room TTL, cleanup interval, and
telemetry interval are capped at 600, 120, 30, and 60 seconds respectively.

Production origins are HTTPS DNS origins with no credentials, path, query, or
fragment. Hostnames are lowercased and stripped of trailing dots before checks.
Single-label names, all IP literals, and exact/subdomain forms of `localhost`,
`local`, `internal`, `lan`, `home`, `home.arpa`, `test`, `invalid`, `example`,
and `onion` are rejected without DNS or public-suffix lookups.
