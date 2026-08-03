# Chat Sessions

One character can own many chats. Raw messages stay inside their chat; only
selected [automatic memory](automatic-memory.md) can cross chats for the same
owner and character.

## Route Behavior

- `/` redirects to `/chat`.
- `/chat` is a draft and does not create a backend chat.
- The draft may show one claimed memory follow-up without creating a chat.
- First send creates the chat, preserves the optimistic message, and navigates
  to `/chat/:chatId`.
- Replying to a follow-up stores that exact prompt as the chat's first assistant
  message in the same create transaction.
- A valid `/chat/:chatId` loads that chat. Invalid id syntax remains a draft and
  does not call the detail endpoint.
- Deleting the active chat returns to `/chat`; deleting another chat keeps the
  current route.
- Clearing messages retains the chat id.

## API

| Method | Route |
| --- | --- |
| `GET/POST` | `/api/personas/:persona_id/chats` |
| `POST` | `/api/personas/:persona_id/follow-up` |
| `GET/DELETE` | `/api/chats/:chat_id` |
| `POST/DELETE` | `/api/chats/:chat_id/messages` |
| `POST` | `/api/chats/:chat_id/messages/stream` |

Message sends include `content`, IANA `timezone`, and attachment ids. Streaming
and JSON sends share validation, context preparation, rate limiting, and atomic
persistence. See [SSE streaming](chat-sse-streaming.md).

Both routes require an active, unexpired server-issued session. Message content
defaults to a 4,000-character limit and the JSON body to 64 KiB. Provider
context keeps at most the most recent 40 messages and 32,000 message characters.
Provider requests default to 1,024 output tokens, while the backend independently
limits the final guarded output to 16,384 Unicode scalar values. All values are
configurable through the `CHAT_*` environment keys.

Delete and clear operations also clean automatic-memory sources. They remove a
memory with no evidence and recalculate one that still has other sources.

Generic sync can provide cache-only readback when a pulled chat id is absent
from canonical backend chats. That recovery view is read-only; see
[Sync system](sync-system.md).
