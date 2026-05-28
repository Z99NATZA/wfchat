# Docker

`docker-compose.yml` lives at the repo root and runs both services:

```text
web -> http://localhost:5173
api -> http://localhost:8080
```

The web image builds `apps/web` and serves the Vite build through nginx.

The api image builds `apps/api` and runs the Axum binary.

The api service reads backend-only secrets from `apps/api/.env` and persists local chat data in `apps/api/data`.

For browser-side axios calls, use:

```text
VITE_API_BASE_URL=http://localhost:8080
```

Use `http://api:8080` only for server-to-server calls from inside Docker.
