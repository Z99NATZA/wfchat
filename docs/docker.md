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
- `AI_VOICE_PROVIDER=voicevox` enables server-side VOICEVOX Engine text-to-speech playback and requires `VOICEVOX_BASE_URL` plus `VOICEVOX_SPEAKER_ID`
- `OPENAI_MODEL` is the text/chat model and is also used for VOICEVOX
  `japanese_translation` speech-text generation when `AI_PROVIDER=openai`
- `AI_VOICE_MODEL` defaults to `gpt-4o-mini-tts`
- `AI_VOICE_ID` defaults to `marin`
- `AI_VOICE_FORMAT` supports `mp3` and `wav`
- `AI_VOICE_INSTRUCTIONS` is optional provider-side voice guidance
- `AI_VOICE_SPEECH_TEXT_POLICY` supports `original` and `japanese_translation`
- `VOICEVOX_CREDIT` is optional non-secret attribution text shown in Settings
  when `AI_VOICE_PROVIDER=voicevox`; set it to the credit required by the
  selected VOICEVOX voice library, for example `VOICEVOX: <speaker name>`
- Optional VOICEVOX tuning env values are backend-owned and applied to the
  `/audio_query` JSON before synthesis when set: `VOICEVOX_SPEED_SCALE`,
  `VOICEVOX_PITCH_SCALE`, `VOICEVOX_INTONATION_SCALE`,
  `VOICEVOX_VOLUME_SCALE`, `VOICEVOX_PRE_PHONEME_LENGTH`, and
  `VOICEVOX_POST_PHONEME_LENGTH`. Values must be numeric; all except pitch
  must be non-negative.
- In Docker Compose, the API defaults `VOICEVOX_BASE_URL` to `http://voicevox:50021` and starts a `voicevox` service from `voicevox/voicevox_engine:cpu-ubuntu20.04-latest`

Unknown voice provider values fail at startup.

Voice input transcription provider requirements:

- `AI_TRANSCRIPTION_PROVIDER=disabled` hides the chat composer microphone action
- `AI_TRANSCRIPTION_PROVIDER=mock` enables backend-generated mock transcripts
  for local UI lifecycle testing
- `AI_TRANSCRIPTION_PROVIDER=openai` enables OpenAI speech-to-text and requires
  `OPENAI_API_KEY`
- `AI_TRANSCRIPTION_MODEL` defaults to `gpt-4o-mini-transcribe`
- `AI_TRANSCRIPTION_PROMPT` is optional provider-side transcription guidance

`OPENAI_MODEL`, `AI_VOICE_MODEL`, and `AI_TRANSCRIPTION_MODEL` target different
provider endpoint capabilities. A latest text model such as `gpt-5.5` can be
used for `OPENAI_MODEL`, but voice playback and transcription should keep
audio-specific model ids supported by their respective endpoints.

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

The API applies embedded SQLx migrations during startup. Docker Compose waits
for PostgreSQL to become healthy, then starts the API; no separate database init
container is required.

Migration ownership is tracked in `docs/database-migrations.md`. Ordered files
under `apps/api/migrations/` are canonical.

Automatic-memory storage and capture use the same embedded migration path. The
capture worker runs inside the API container and the durable outbox stays in
PostgreSQL, so no additional Compose service, volume, port, or environment value
is required. `docker compose up -d --build` rebuilds the API, applies the outbox
migration to the existing PostgreSQL volume during startup, and then starts the
worker. With `AI_PROVIDER=mock`, extraction jobs complete without learned
items; configured OpenAI-compatible providers perform structured extraction
using their existing backend model and credentials.

For local manual bootstrap only, legacy schema SQL remains at
`apps/api/db/init.sql`:

```bash
psql "postgres://postgres:postgres@localhost:5432/wfchat" -v ON_ERROR_STOP=1 -f apps/api/db/init.sql
```

Do not add future schema changes only to `init.sql`; add a new migration file
instead.
