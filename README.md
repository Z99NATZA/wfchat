# WaifuChat

WaifuChat is a full-stack chat app with a React frontend, Rust API, and PostgreSQL database.

## Stack

- Frontend: ReactJS + TypeScript
- Backend: Rust + Axum
- Database: PostgreSQL

## Install and Docker run

```bash
# clone the repository
git clone https://github.com/Z99NATZA/wfchat.git
cd wfchat

# 'npm run init' creates or updates local env files from the example files.
npm run init 

# .env
# VITE_GOOGLE_CLIENT_ID=

# apps/api/.env
# OPENAI_API_KEY=
# GOOGLE_CLIENT_ID=

# start
docker compose up -d --build

# stop
docker compose down

# default URLs
# web: http://localhost:5173
# api: http://localhost:8080
```

More Docker details: [docs/docker.md](docs/docker.md).

## License

MIT. See [LICENSE](LICENSE).
