# WFChat

## Stack

Frontend: ReactJS + TypeScript

Backend: Rust + Axum

## Install

```bash
npm install
npm run init
```

## Run Frontend

```bash
npm run dev:web
```

Frontend: `http://localhost:5173`

## Run Backend

Start PostgreSQL first:

```bash
docker run --name wfchat-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=wfchat -p 5432:5432 -d postgres:16-alpine
```

Then set `DATABASE_URL` in `apps/api/.env` (copy from `apps/api/.env.example`) and run:

```bash
npm run dev:api
```

Backend API: `http://localhost:8080`

## Database Schema (Single SQL)

Schema file: `apps/api/db/init.sql`

Manual apply (to any PostgreSQL):

```bash
psql "postgres://postgres:postgres@localhost:5432/wfchat" -v ON_ERROR_STOP=1 -f apps/api/db/init.sql
```

Docker apply (from this repo):

```bash
docker compose up -d postgres
docker compose run --rm db-init
```

## Build And Check

```bash
npm run build
```

## Docker

```bash
docker compose up --build
```

Docker frontend: `http://localhost:5173`

Docker backend API: `http://localhost:8080`

More runtime and environment details: `docs/docker.md`
