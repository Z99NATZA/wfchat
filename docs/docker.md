# Docker

`docker-compose.yml` runs PostgreSQL, the Rust API, VOICEVOX Engine, and the
nginx-served web app. The checked-in Compose configuration is the private
development/LAN workflow and uses `APP_ENV=development`; running containers
does not by itself make the deployment production-ready.

| Service    | Host port | Persistent data |
| ---------- | --------: | --------------- |
| `postgres` |      5432 | `pgdata`        |
| `api`      |      8080 | `api_uploads`   |
| `voicevox` |     50021 | none            |
| `web`      |      5173 | none            |

## Setup And Run

```powershell
npm run init
docker compose up -d --build
```

`npm run init` rebuilds `.env`, `apps/api/.env`, and `apps/web/.env` in their
example order. It preserves supported raw values, fills missing keys from the
examples, moves uniquely owned misplaced values, and removes unsupported keys.
All three files pass preflight before any target changes. Changed existing
targets receive a sibling `.backup-*` file before replacement; a partial
replacement is rolled back on a best-effort basis. Conflicts, malformed or
unterminated values, and concurrent target changes stop the run. Backend
secrets belong only in `apps/api/.env`.

The API waits for PostgreSQL health, applies embedded SQLx migrations, then
starts background memory and attachment-cleanup work. Web waits for API health.
`/api/health` checks the API directly on port 8080 and through nginx on 5173.

## Logs

The Rust API emits newline-delimited structured JSON through `tracing` to
standard output. Docker captures the `api` container stream, which can be read
or followed with:

```powershell
docker compose logs api
docker compose logs --follow api
```

The runtime flow is `Rust tracing -> API stdout -> Docker capture -> docker
compose logs`. The application does not write log files. The checked-in Compose
file does not select a logging driver or configure rotation, retention, or
external storage; Docker therefore uses the host's configured default. Those
controls are responsibilities of the separately managed production deployment.
See [Logging](logging.md) for event fields and sensitive-data boundaries.

## Networking

The Docker web build leaves `VITE_API_BASE_URL` empty. Browser requests remain
same-origin on port 5173 and nginx proxies `/api/*` to `api:8080`, including
WebSocket upgrade headers and unbuffered SSE.

For separate non-Docker frontend development:

```text
VITE_API_BASE_URL=http://localhost:8080
```

For another device on the LAN, set `WFCHAT_PUBLIC_HOST` to the host's LAN IP,
rebuild, and open:

```text
http://<host-lan-ip>:5173
```

Only port 5173 is required by the browser. `FRONTEND_ORIGINS` controls direct
cross-origin API access.

Root `WFCHAT_COMPOSE_VOICEVOX_BASE_URL` controls the URL mapped to the API
container's `VOICEVOX_BASE_URL`. This keeps the Compose-facing value distinct
from the API-local value in `apps/api/.env`.

For a separately managed public deployment, set `APP_ENV=production` and
explicit public HTTPS `FRONTEND_ORIGIN(S)`. The checked-in Compose configuration
overrides those origins with HTTP development/LAN values and is not the public
deployment template. Production startup rejects IP/local/reserved origins, the
compatibility session header, and invalid chat safety limits. TLS termination,
public reverse-proxy configuration, firewall rules, and backup remain host
deployment responsibilities.

Direct requests are keyed by the socket peer IP. When a separately managed
reverse proxy is used, set `TRUST_PROXY_HEADERS=true` only with explicit
`TRUSTED_PROXY_CIDRS`; the API then evaluates a single `X-Forwarded-For` chain.
This repository does not configure that production proxy.

The nginx web server sends a CSP compatible with same-origin API/WebSocket use,
Google Sign-In, hosted fonts, and HTTPS user images. It denies frame embedding
and sends `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and
`Referrer-Policy: strict-origin-when-cross-origin`.

## Provider Configuration

Chat provider modes:

- `mock`
- `openai` with `OPENAI_API_KEY` and `OPENAI_MODEL`
- `xai` with `XAI_API_KEY` and `XAI_MODEL`
- `lmstudio` with `LMSTUDIO_MODEL`

Unknown values fail startup validation.

Voice modes are `disabled|mock|openai|voicevox`. Transcription modes are
`disabled|mock|openai`. See [Chat voice](chat-voice.md) for capability-specific
models, speech policy, VOICEVOX attribution, and tuning.

Attachment size/dimension defaults are configured by `CHAT_ATTACHMENT_*`; see
[Chat image attachments](chat-image-attachments.md). Exact environment keys and
defaults live in `apps/api/.env.example` and `apps/api/src/config.rs`.

Chat request/context/output limits, AI timeouts, concurrency, global rate, and
media capability gates use `CHAT_*` keys. When omitted, image upload,
transcription, and TTS default off in production and can be enabled
independently after their provider and host boundaries are ready. The generated
development `.env` explicitly enables all three.

Production fixes guest admission at 10 requests per resolved IP and 60 globally
per minute. Chat creation and sends are fixed at 20 requests per session/IP and
120 globally per minute. Production also caps each owner at 50 chats and each
chat at 100 messages and 500,000 stored Unicode scalar values. The exact keys
and development defaults are in `apps/api/.env.example`.

The compose build enables Markdown QA at `/chat?qa=markdown`. Other web builds
default `VITE_ENABLE_MARKDOWN_QA` to false. Root
`VITE_ENABLE_STREAMING_SPEECH_PLAYBACK` is passed through the Compose web build
and defaults to false.

## Persistence And Caching

Schema changes come only from `apps/api/migrations/`; `db/init.sql` is not
part of normal Compose startup.

Uploaded images live in `api_uploads`; database data lives in `pgdata`.
In-process Cafe rooms and memory telemetry do not survive an API restart.

Built assets and versioned Aiko/PNGTuber/Cafe images use immutable nginx caching.
Replacing one requires a new filename and a metadata update.
