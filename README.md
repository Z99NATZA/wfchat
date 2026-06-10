# WaifuChat

WaifuChat is a full-stack chat app with a React frontend, Rust API, and PostgreSQL database.

## Stack

- Frontend: ReactJS + TypeScript
- Backend: Rust + Axum
- Database: PostgreSQL

## Install

Clone the repository:

```bash
git clone https://github.com/Z99NATZA/wfchat.git
cd wfchat
npm run init
```

`npm run init` creates or updates local env files from the example files.

## Docker

Edit `.env`:

```env
VITE_GOOGLE_CLIENT_ID=
```

Edit `apps/api/.env`:

```env
OPENAI_API_KEY=
GOOGLE_CLIENT_ID=
```

Start all services:

```bash
docker compose up -d --build
```

Default URLs:

- Web: `http://localhost:5173`
- API: `http://localhost:8080`

Stop services:

```bash
docker compose down
```

More Docker details: [docs/docker.md](docs/docker.md).

## License

MIT. See [LICENSE](LICENSE).
