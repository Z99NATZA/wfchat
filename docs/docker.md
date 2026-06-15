# Docker

`docker-compose.yml` lives at the repo root and runs both services:

```text
web -> http://localhost:5173
api -> http://localhost:8080
```

The web image builds `apps/web` and serves the Vite build through nginx.

The api image builds `apps/api` and runs the Axum binary.

The api service reads backend-only secrets from `apps/api/.env`.

## Environment Setup

Create local env files once after clone:

```bash
npm run init
```

This creates missing env files and adds newly introduced keys to existing env files without overwriting current values:

- `apps/api/.env` from `apps/api/.env.example`
- `apps/web/.env` from `apps/web/.env.example`

## API Startup Validation

The API validates required env values at startup and exits immediately with a clear config error when missing.

Provider requirements:

- `AI_PROVIDER=openai` requires `OPENAI_API_KEY` and `OPENAI_MODEL`
- `AI_PROVIDER=xai` requires `XAI_API_KEY` and `XAI_MODEL`
- `AI_PROVIDER=lmstudio` requires `LMSTUDIO_MODEL`
- `AI_PROVIDER=mock` requires no external API key
- `AI_PROVIDER=anthropic` and `AI_PROVIDER=claude` are not implemented and fail at startup

Unknown provider values also fail at startup.

For browser-side axios calls, use:

```text
VITE_API_BASE_URL=http://localhost:8080
```

Use `http://api:8080` only for server-to-server calls from inside Docker.

## LAN Sharing

To open the Docker web app from another device on the same Wi-Fi, set the root `.env` `WFCHAT_PUBLIC_HOST` to the host machine's LAN IP:

```text
WFCHAT_PUBLIC_HOST=10.42.17.228
```

Then rebuild the web image because `VITE_API_BASE_URL` is baked into the static frontend bundle:

```bash
docker compose up -d --build
```

Open the web app from the other device with:

```text
http://10.42.17.228:5173
```

The root `docker-compose.yml` uses this host for both:

- API CORS `FRONTEND_ORIGIN`
- web build arg `VITE_API_BASE_URL`

If `WFCHAT_PUBLIC_HOST` is unset, Docker Compose defaults to `localhost` for normal local use.

For local chat Markdown QA, the root `docker-compose.yml` builds the web image with:

```text
VITE_ENABLE_MARKDOWN_QA=true
```

This exposes the frontend-only `Load QA` action at `http://localhost:5173/chat?qa=markdown`. Use the query string exactly; `/chat/qa` is a chat path segment, not the QA fixture route. The web `Dockerfile` defaults this build arg to `false` for non-local builds.

## Database Init Options

Single schema SQL lives at `apps/api/db/init.sql`.

Apply manually:

```bash
psql "postgres://postgres:postgres@localhost:5432/wfchat" -v ON_ERROR_STOP=1 -f apps/api/db/init.sql
```

Apply with Docker job:

```bash
docker compose up -d postgres
docker compose run --rm db-init
```

This `db-init` container can target any reachable PostgreSQL by overriding `DATABASE_URL`:

```bash
docker compose run --rm -e DATABASE_URL="postgres://USER:PASS@HOST:5432/DB" db-init
```
