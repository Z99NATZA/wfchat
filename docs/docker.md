# Docker

`docker-compose.yml` runs PostgreSQL, the Rust API, VOICEVOX Engine, and the
nginx-served web app. The checked-in Compose configuration is the private
development/LAN workflow and uses `APP_ENV=development`; running containers
does not by itself make the deployment production-ready.

| Service | Host port | Persistent data |
| --- | ---: | --- |
| `postgres` | 5432 | `pgdata` |
| `api` | 8080 | `api_uploads` |
| `voicevox` | 50021 | none |
| `web` | 5173 | none |

## Setup And Run

```powershell
npm run init
docker compose up -d --build
```

`npm run init` creates missing `apps/api/.env` and `apps/web/.env` from
their examples and adds missing keys without overwriting existing values.
Backend secrets belong only in `apps/api/.env`.

The API waits for PostgreSQL health, applies embedded SQLx migrations, then
starts background memory and attachment-cleanup work. Web waits for API health.
`/api/health` checks the API directly on port 8080 and through nginx on 5173.

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

For a public host, set `APP_ENV=production` and explicit public HTTPS
`FRONTEND_ORIGIN(S)`. Startup then rejects IP/local/reserved origins, the
compatibility session header, and invalid chat safety limits. TLS termination,
public reverse-proxy configuration, firewall rules, and backup remain host
deployment responsibilities rather than properties of this development
Compose file.

Direct requests are keyed by the socket peer IP. When a separately managed
reverse proxy is used, set `TRUST_PROXY_HEADERS=true` only with explicit
`TRUSTED_PROXY_CIDRS`; the API then evaluates a single `X-Forwarded-For` chain.
This repository does not configure that production proxy.

## Provider Configuration

Chat provider modes:

- `mock`
- `openai` with `OPENAI_API_KEY` and `OPENAI_MODEL`
- `xai` with `XAI_API_KEY` and `XAI_MODEL`
- `lmstudio` with `LMSTUDIO_MODEL`

`anthropic`/`claude` and unknown values fail startup validation.

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

The compose build enables Markdown QA at `/chat?qa=markdown`. Other web builds
default `VITE_ENABLE_MARKDOWN_QA` to false.

## Persistence And Caching

Schema changes come only from `apps/api/migrations/`; `db/init.sql` is not
part of normal Compose startup.

Uploaded images live in `api_uploads`; database data lives in `pgdata`.
In-process Cafe rooms and memory telemetry do not survive an API restart.

Built assets and versioned Aiko/PNGTuber/Cafe images use immutable nginx caching.
Replacing one requires a new filename and a metadata update.
