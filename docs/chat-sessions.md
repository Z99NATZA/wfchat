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
  message in the same create transaction. If that first message exceeds the
  message-count or stored-character limit, creation returns the message-limit
  conflict and leaves neither a chat nor a follow-up link.
- A valid `/chat/:chatId` loads that chat. Invalid id syntax remains a draft and
  does not call the detail endpoint.
- Deleting the active chat returns to `/chat`; deleting another chat keeps the
  current route.
- Clearing messages retains the chat id.

## API

| Method        | Route                                 |
| ------------- | ------------------------------------- |
| `GET/POST`    | `/api/personas/:persona_id/chats`     |
| `POST`        | `/api/personas/:persona_id/follow-up` |
| `GET/DELETE`  | `/api/chats/:chat_id`                 |
| `POST/DELETE` | `/api/chats/:chat_id/messages`        |
| `POST`        | `/api/chats/:chat_id/messages/stream` |

Message sends include `content`, IANA `timezone`, and attachment ids. Streaming
and JSON sends share validation, context preparation, rate limiting, and atomic
persistence. See [SSE streaming](chat-sse-streaming.md).

Persona chat lists return at most 50 summary rows. Each row contains chat
metadata and a last-message preview truncated to 256 Unicode scalar values;
the list query does not load each chat's message history. Successful JSON and
streaming sends return only the newly committed user/assistant pair. The
frontend merges that pair into its current conversation.

Both routes require an active, unexpired server-issued session. Message content
defaults to a 4,000-character limit and the JSON body to 64 KiB. Provider
context keeps at most the most recent 40 messages and 32,000 message characters.
Provider requests default to 1,024 output tokens, while the backend independently
limits the final guarded output to 16,384 Unicode scalar values. All values are
configurable through the `CHAT_*` environment keys.

Production admits at most 50 chats per owner, 100 stored messages per chat, and
500,000 stored Unicode scalar values per chat. The store rechecks these limits
inside the owning write transaction. Chat-cap rejection returns HTTP `409` with
`{"error":"conflict: chat limit reached"}`. Message-count or stored-character
rejection returns HTTP `409` with
`{"error":"conflict: chat message limit reached"}`. Reading, clearing, and
deleting a full chat remain available.

Chat creation and JSON/SSE sends share process-local 60-second buckets: 20
requests per session and resolved IP and 120 globally. Rejection returns HTTP
`429`, `Retry-After: 60`, and `{"error":"too many requests"}`.

Generation and clear share one process-local exclusive permit per chat.
Generation owns it from before context preparation through the append commit.
Clear acquires it without waiting and returns HTTP `409` with
`{"error":"conflict: chat generation in progress"}` if generation is active.
Provider waits never hold a database transaction or row lock.

Authenticated chat and persona follow-up responses, including errors and SSE,
use `Cache-Control: private, no-store`.

Delete and clear operations also clean automatic-memory sources. They remove a
memory with no evidence and recalculate one that still has other sources.

Generic sync can provide cache-only readback when a pulled chat id is absent
from canonical backend chats. That recovery view is read-only; see
[Sync system](sync-system.md).
