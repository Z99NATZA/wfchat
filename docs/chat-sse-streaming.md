# Chat SSE Streaming

The chat UI uses a POST-based Server-Sent Events stream for assistant text and
keeps the non-streaming endpoint as a pre-start fallback.

## Request And Events

```text
POST /api/chats/:chat_id/messages/stream
Accept: text/event-stream
Content-Type: application/json
Cookie: wfchat_session=<session>
```

The JSON body matches the normal message endpoint:
`{ content, timezone, attachments }`.

| Event | Payload | Meaning |
| --- | --- | --- |
| `message_start` | `{ chat_id, persona_id }` | Validation passed and generation is starting |
| `token` | `{ text }` | Append a provider-dependent text chunk |
| `message_done` | `{ chat_id, user_message, assistant_message, messages }` | Both messages committed; replace optimistic state |
| `error` | `{ message }` | Stream failed before persistence |

The response sets `Cache-Control: no-cache`, `X-Accel-Buffering: no`, and a
15-second SSE keepalive. The browser uses `fetch` rather than `EventSource`
because the request needs a body and credentials.

The parser accepts split chunks, CRLF, comments, multiline data, and a final
frame without a trailing blank line. Empty token text is ignored.

## Completion And Failure Boundaries

The frontend creates an optimistic user message and one
`local-assistant-*` placeholder. Tokens append to that placeholder. On
`message_done`, the full server message list replaces optimistic state.

The backend persists the user message, assistant message, image links, chat
timestamp, and automatic-memory extraction job only after generation succeeds.
It does not persist partial generations. An SSE `error` therefore removes the
optimistic pair and leaves the canonical chat unchanged.

If the streaming request fails before `message_start`, `useChatSession` retries
through `POST /api/chats/:chat_id/messages`. It does not retry after a stream
has started because the provider may already have generated output.

Both message routes share the same 20-requests-per-minute in-memory rate-limit
bucket.

## Provider Behavior

- `mock` emits deterministic delayed chunks.
- OpenAI, LM Studio, and xAI use the OpenAI-compatible native SSE parser.
- The Aiko response guard uses a rolling buffer so boundary-split Thai masculine
  terms are corrected before any token reaches the UI.
- A provider adapter without native streaming may complete normally and emit
  the final text as one token; the frontend contract stays the same.

Provider/model selection remains backend-owned.

## Shared Chat Preparation

Streaming and non-streaming use
`prepare_chat_completion_context()`. Request validation, attachment loading,
timezone normalization, chat history, and automatic-memory retrieval therefore
do not vary by transport. Memory failure is fail-open and does not alter SSE
events. See [Automatic memory](automatic-memory.md).

## Avatar Integration

```text
request begins       -> assistant_waiting  -> thinking
first non-empty token-> assistant_streaming -> talking
message_done         -> assistant_replied  -> inferred expression, then idle
failure              -> assistant_error    -> sad/idle
```

These are semantic avatar events; streaming code does not import PNG renderer
details.

## Ownership And Verification

- Route, event framing, and persistence boundary:
  `apps/api/src/chat/messages.rs`
- Provider streaming: `apps/api/src/ai/`
- Browser parser/service:
  `apps/web/src/features/chat/services/chatApiService.ts`
- Optimistic state and fallback:
  `apps/web/src/features/chat/hooks/useChatSession.ts`

Backend tests cover event order, sanitized errors, provider parsing, response
guard boundaries, and atomic persistence. Frontend tests cover parser framing,
optimistic updates, fallback, error cleanup, and avatar lifecycle.
