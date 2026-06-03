# WFChat

## Stack

Frontend: ReactJS + TypeScript

Backend: Rust + Axum

Database: PostgreSQL

## Install

Run once after clone:

```bash
npm install
npm run init
```

`npm run init` creates local env files when they do not exist:

- `.env` from `.env.example`
- `apps/api/.env` from `apps/api/.env.example`
- `apps/web/.env` from `apps/web/.env.example`

## Run With Docker

Docker runs PostgreSQL, API, DB init, and Web from `docker-compose.yml`.

### 1. Prepare root env

Edit `.env`:

```env
VITE_GOOGLE_CLIENT_ID=your-google-client-id
```

Docker uses this root value as the web build arg.

### 2. Prepare API env

Edit `apps/api/.env`:

```env
OPENAI_API_KEY=your-openai-api-key
GOOGLE_CLIENT_ID=your-google-client-id
AI_PROVIDER=openai
AI_MODEL=gpt-4.1-mini
OPENAI_MODEL=gpt-4.1-mini
```

For Docker, `DATABASE_URL`, `APP_HOST`, `APP_PORT`, and `FRONTEND_ORIGIN` are supplied by `docker-compose.yml`.

### 3. Start all services

```bash
docker compose up --build
```

URLs:

- Web: `http://localhost:5173`
- API: `http://localhost:8080`
- PostgreSQL: `localhost:5432`

### 4. Stop services

```bash
docker compose down
```

To remove the PostgreSQL volume too:

```bash
docker compose down -v
```

## Run Locally

Local mode runs the same system directly on your machine and requires a local PostgreSQL server.

### 1. Prepare API env

Edit `apps/api/.env`:

```env
APP_HOST=0.0.0.0
APP_PORT=8080
FRONTEND_ORIGIN=http://localhost:5173
DATABASE_URL=postgres://postgres:postgres@localhost:5432/wfchat
GOOGLE_CLIENT_ID=your-google-client-id

AI_PROVIDER=openai
AI_MODEL=gpt-4.1-mini
OPENAI_API_KEY=your-openai-api-key
OPENAI_MODEL=gpt-4.1-mini
OPENAI_BASE_URL=https://api.openai.com/v1
```

### 2. Prepare Web env

Edit `apps/web/.env`:

```env
VITE_API_BASE_URL=http://localhost:8080
VITE_GOOGLE_CLIENT_ID=your-google-client-id
```

### 3. Start local PostgreSQL

Create the database once if it does not exist:

```bash
psql "postgres://postgres:postgres@localhost:5432/postgres" -c "CREATE DATABASE wfchat"
```

Apply the schema:

```bash
psql "postgres://postgres:postgres@localhost:5432/wfchat" -v ON_ERROR_STOP=1 -f apps/api/db/init.sql
```

If your PostgreSQL user, password, host, or port differs, update `DATABASE_URL` in `apps/api/.env` and the `psql` commands accordingly.

### 4. Start API

In one terminal:

```bash
npm run dev:api
```

API: `http://localhost:8080`

### 5. Start Web

In another terminal:

```bash
npm run dev:web
```

Web: `http://localhost:5173`

## Database Schema

Schema file: `apps/api/db/init.sql`

Docker apply only:

```bash
docker compose up -d postgres
docker compose run --rm db-init
```

Manual apply:

```bash
psql "postgres://postgres:postgres@localhost:5432/wfchat" -v ON_ERROR_STOP=1 -f apps/api/db/init.sql
```

## Build And Check

```bash
npm run build
```

More Docker details: `docs/docker.md`
