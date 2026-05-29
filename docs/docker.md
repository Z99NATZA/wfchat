# Docker

`docker-compose.yml` lives at the repo root and runs both services:

```text
web -> http://localhost:5173
api -> http://localhost:8080
```

The web image builds `apps/web` and serves the Vite build through nginx.

The api image builds `apps/api` and runs the Axum binary.

The api service reads backend-only secrets from `apps/api/.env` and persists local chat data in `apps/api/data`.

## Environment Setup

Create local env files once after clone:

```bash
npm run init
```

This creates:

- `apps/api/.env` from `apps/api/.env.example`
- `apps/web/.env` from `apps/web/.env.example`

If a target `.env` already exists, the init script leaves it unchanged.

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
