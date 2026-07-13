# Chat Sessions

- Data model: `persona -> chats -> messages`
- One persona can have many chats.
- Raw conversation history remains isolated per chat. Requests may additionally
  include a small relevant learned-context block captured from other chats for
  the same owner and character.

## URL behavior

- `/` redirects to `/chat`.
- `/chat` opens the chat workspace without creating a backend chat yet.
- `/chat` may display one provisional personalized assistant follow-up from
  automatic memory. Displaying it still does not create a backend chat.
- The first sent message creates a backend chat for the selected persona, then
  navigates to `/chat/:chatId`. When replying to a displayed follow-up, chat
  creation first persists that exact opening as an assistant message so the
  reply has coherent context.
- The first optimistic user message remains visible while the newly created chat
  route is active and the assistant response is still pending.
- `/chat/:chatId` opens that exact chat.
- Refresh keeps current chat because the URL still contains `chatId`.
- Deleting the active chat returns to the empty `/chat` draft instead of opening
  another remaining chat. Other sessions remain available in the sidebar.
- Deleting an inactive chat leaves the current chat open.

## API

- `GET /api/personas/:persona_id/chats`
- `POST /api/personas/:persona_id/chats`
- `POST /api/personas/:persona_id/follow-up`
- `GET /api/chats/:chat_id`
- `POST /api/chats/:chat_id/messages`
- `POST /api/chats/:chat_id/messages/stream`
- `DELETE /api/chats/:chat_id`
- `DELETE /api/chats/:chat_id/messages`

The follow-up endpoint accepts `{ claim_key, locale }` and returns either one
claimed follow-up or `null`. Display is limited server-side to one per owner and
character in a rolling 24-hour window and is idempotent for the same claim key.
No eligible unresolved plan or goal means no prompt; there is no generic
fallback. A failed request is ignored by the draft UI so normal New Chat sending
remains available.

`POST /api/personas/:persona_id/chats` accepts an optional `follow_up_id`. When
present, the backend creates the chat and its initial assistant opening in one
transaction only if the claimed delivery belongs to the same owner and
character and has not already been attached to a chat. An unavailable delivery
rolls back chat creation. Without `follow_up_id`, chat creation retains its
normal empty-session behavior.

After either message endpoint persists its user/assistant turn, the same
transaction creates an idempotent automatic-memory extraction job. Background
capture never delays the normal JSON response or SSE `done` event, and
extraction failures do not roll back a successfully persisted response.

Before either message endpoint calls the provider, the backend retrieves a
bounded set of relevant, unexpired memory items for the exact owner and
character. Bounded Thai/English aliases expand to canonical topics for both the
database query and deterministic scoring, so a new Thai chat about `เพลง` can
reuse an English-tagged `music` preference. Specific terms rank ahead of broad
category matches, and category-only context is limited to prevent unrelated
preferences from flooding the prompt. The same preparation function injects
this soft context after the character prompt and before current-chat messages.
The public request and response contracts do not change, and a
retrieval-specific failure falls back to chat without memory.

The shared preparation path also updates privacy-safe process counters for
selected, empty, and fail-open retrieval outcomes and prompt-budget usage.
These counters do not change either chat transport or expose user content.

Deleting a chat through `DELETE /api/chats/:chat_id` also removes automatic
memory source rows tied to that chat. Affected learned context is deleted when
no source remains and retained when another chat still supports it. Automatic
capture and bounded retrieval are implemented.

Clearing a chat's messages removes message-level memory sources and applies the
same orphan cleanup while retaining the chat id.

Expired learned context is filtered at retrieval time. Chat/source deletion and
learned-context reset remain transactional lifecycle boundaries, and reset also
removes pending, retry, and processing extraction jobs so stale work cannot
recreate pre-reset memory.

The streaming path is additive. It returns SSE-framed assistant response events and keeps the non-streaming message endpoint available as a fallback.

See `docs/chat-sse-streaming.md` for the current SSE contract.
