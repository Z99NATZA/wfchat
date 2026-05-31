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
