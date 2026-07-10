# Chat Sessions

- Data model: `persona -> chats -> messages`
- One persona can have many chats.
- Each chat has isolated context; requests only include messages from that chat.

## URL behavior

- `/` redirects to `/chat`.
- `/chat` opens the chat workspace without creating a backend chat yet.
- The first sent message creates a backend chat for the selected persona, then navigates to `/chat/:chatId`.
- `/chat/:chatId` opens that exact chat.
- Refresh keeps current chat because the URL still contains `chatId`.

## API

- `GET /api/personas/:persona_id/chats`
- `POST /api/personas/:persona_id/chats`
- `GET /api/chats/:chat_id`
- `POST /api/chats/:chat_id/messages`
- `POST /api/chats/:chat_id/messages/stream`
- `DELETE /api/chats/:chat_id/messages`

Deleting a chat through `DELETE /api/chats/:chat_id` also removes automatic
memory source rows tied to that chat. Affected learned context is deleted when
no source remains and retained when another chat still supports it. Automatic
capture and retrieval are not implemented yet; this is a persistence lifecycle
boundary only.

Clearing a chat's messages removes message-level memory sources and applies the
same orphan cleanup while retaining the chat id.

The streaming path is additive. It returns SSE-framed assistant response events and keeps the non-streaming message endpoint available as a fallback.

See `docs/chat-sse-streaming.md` for the completed first-iteration SSE contract.
