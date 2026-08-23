# WaifuChat

```text
Project created: 2026-05-27
- Open Source
- Vibe coding
```

![WaifuChat chat interface](docs/images/wfchat-chat-interface.png)
![Aiko Cafe interface](docs/images/aiko-cafe.png)

## Stack

```text
Frontend: ReactJS + TypeScript
Backend: Rust + Axum
Database: PostgreSQL
```

## Development And LAN Quickstart


```bash
# clone
git clone https://github.com/Z99NATZA/wfchat.git
cd wfchat

# sync env
npm run init
```

- .env

`VITE_GOOGLE_CLIENT_ID=` optional Google sign-in

`VITE_ENABLE_STREAMING_SPEECH_PLAYBACK=false`

`WFCHAT_PUBLIC_HOST=localhost` LAN IP

`WFCHAT_COMPOSE_VOICEVOX_BASE_URL=http://voicevox:50021`

`VOICEVOX_SPEAKER_ID=23` VOICEVOX speaker/style id

 - apps/api/.env

`OPENAI_API_KEY=` required

`GOOGLE_CLIENT_ID=` use the same VITE_GOOGLE_CLIENT_ID

`AI_PROVIDER=openai` if use openai

`AI_VOICE_PROVIDER=voicevox` assistant text -> spoken audio

`AI_TRANSCRIPTION_PROVIDER=mock` user microphone audio -> text; mock is for dev mode

`CHAT_ATTACHMENT_UPLOAD_DIR=data/uploads`

```bash
# start
docker compose up -d --build

# follow logs
docker compose logs --follow api

# stop
docker compose down

# default URLs
# web: http://localhost:5173
# api: http://localhost:8080
# lan: http://<LAN_IP>:5173
```
More [Docker](docs/docker.md)

## License

MIT. See [LICENSE](LICENSE).
