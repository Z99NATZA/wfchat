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
# WFCHAT_PUBLIC_HOST=localhost

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

To open the Docker app from another device on the same Wi-Fi, use this machine's LAN IP:

```bash
docker compose up -d --build
```

Open `http://<LAN_IP>:5173` from the other device. The Docker web container proxies `/api` to the API container internally, so the browser only needs to reach port `5173`.

More Docker details: [docs/docker.md](docs/docker.md).

## License

MIT. See [LICENSE](LICENSE).
