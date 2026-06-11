# Chat Sessions

- Data model: `persona -> chats -> messages`
- One persona can have many chats.
- Each chat has isolated context; requests only include messages from that chat.

## URL behavior

- `/` creates a new chat for the selected persona.
- `/chat/:chatId` opens that exact chat.
- Refresh keeps current chat because the URL still contains `chatId`.

## API

- `GET /api/personas/:persona_id/chats`
- `POST /api/personas/:persona_id/chats`
- `GET /api/chats/:chat_id`
- `POST /api/chats/:chat_id/messages`
- Planned additive streaming path: `POST /api/chats/:chat_id/messages/stream`
- `DELETE /api/chats/:chat_id/messages`

See `docs/chat-sse-streaming.md` for the scoped SSE design.
