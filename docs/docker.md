# Docker

`docker-compose.yml` lives at the repo root and runs both services:

```text
web -> http://localhost:5173
api -> http://localhost:8080
```

The web image builds `apps/web` and serves the Vite build through nginx.

The nginx config gives built frontend assets long-lived immutable caching. Repo-owned character images such as `/images/aiko-avatar.png` and PNGTuber images under `/images/aiko-pngtuber/` also use long-lived immutable caching because the asset contract requires a new filename when replacing an image. Other `/images/` files keep a conservative `no-cache` policy.

The api image builds `apps/api` and runs the Axum binary.

The api service reads backend-only secrets from `apps/api/.env`.

In Docker, nginx also proxies `/api/*` from the web container to the API service at `http://api:8080`. This keeps browser traffic on the same origin as the web app and avoids requiring LAN clients to reach port `8080` directly.

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

Voice playback provider requirements:

- `AI_VOICE_PROVIDER=disabled` hides assistant voice playback actions
- `AI_VOICE_PROVIDER=mock` enables backend-generated mock WAV playback for local UI lifecycle testing
- `AI_VOICE_PROVIDER=openai` enables OpenAI text-to-speech playback and requires `OPENAI_API_KEY`
- `AI_VOICE_MODEL` defaults to `gpt-4o-mini-tts`
- `AI_VOICE_ID` defaults to `marin`
- `AI_VOICE_FORMAT` supports `mp3` and `wav`
- `AI_VOICE_INSTRUCTIONS` is optional provider-side voice guidance

Unknown voice provider values fail at startup.

Voice input transcription provider requirements:

- `AI_TRANSCRIPTION_PROVIDER=disabled` hides the chat composer microphone action
- `AI_TRANSCRIPTION_PROVIDER=mock` enables backend-generated mock transcripts
  for local UI lifecycle testing
- `AI_TRANSCRIPTION_PROVIDER=openai` enables OpenAI speech-to-text and requires
  `OPENAI_API_KEY`
- `AI_TRANSCRIPTION_MODEL` defaults to `gpt-4o-mini-transcribe`
- `AI_TRANSCRIPTION_PROMPT` is optional provider-side transcription guidance

Unknown transcription provider values fail at startup.

For local non-Docker browser-side axios calls, use:

```text
VITE_API_BASE_URL=http://localhost:8080
```

For Docker web builds, `VITE_API_BASE_URL` is intentionally empty so browser requests stay relative to the web origin and go through the nginx `/api` proxy. Use `http://api:8080` only for server-to-server calls from inside Docker.

## LAN Sharing

To open the Docker web app from another device on the same Wi-Fi, use the host machine's LAN IP:

```text
http://10.42.17.228:5173
```

Rebuild and start the containers:

```bash
docker compose up -d --build
```

The other device only needs to reach port `5173`. Chat API calls go to `http://10.42.17.228:5173/api/...` and nginx forwards them to the API container inside Docker.

The root `docker-compose.yml` still keeps both `http://localhost:5173` and `http://<WFCHAT_PUBLIC_HOST>:5173` in the API CORS allow-list for direct API access and development diagnostics.

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
