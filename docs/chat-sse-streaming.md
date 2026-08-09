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

| Event           | Payload                                        | Meaning                                                  |
| --------------- | ---------------------------------------------- | -------------------------------------------------------- |
| `message_start` | `{ chat_id, persona_id }`                      | Validation passed and generation is starting             |
| `token`         | `{ text }`                                     | Append a provider-dependent text chunk                   |
| `message_done`  | `{ chat_id, user_message, assistant_message }` | Both new messages committed; replace the optimistic pair |
| `error`         | `{ message, reason? }`                         | Stream failed before persistence                         |

The response sets `Cache-Control: private, no-store`, `X-Accel-Buffering: no`, and a
15-second SSE keepalive. The browser uses `fetch` rather than `EventSource`
because the request needs a body and credentials.

The parser accepts split chunks, CRLF, comments, multiline data, and a final
frame without a trailing blank line. Empty token text is ignored.

## Completion And Failure Boundaries

The frontend creates an optimistic user message and one
`local-assistant-*` placeholder. Tokens append to that placeholder. On
`message_done`, the committed pair replaces its optimistic pair while existing
history remains in place.

The backend persists the user message, assistant message, image links, chat
timestamp, and automatic-memory extraction job only after generation succeeds.
It does not persist partial generations. An SSE `error` removes the optimistic
assistant placeholder but retains the local user message with localized Aiko
feedback and retry when the failure is retryable. The canonical chat remains
unchanged, and local-only message ids are excluded from sync snapshots.

If the streaming transport fails before `message_start` without receiving an
HTTP response, `useChatSession` retries through
`POST /api/chats/:chat_id/messages`. A recognized HTTP rejection does not use
the JSON fallback, preventing the same user send from consuming the shared
quota twice. It does not retry after a stream has started because the provider
may already have generated output.

Chat creation and both message routes share the same per-session/IP and global
in-memory rate limits. Only one generation may run for a chat at a time; process-wide and
per-session concurrency limits also apply. Rejection returns HTTP 429 with
`Retry-After: 60`, `retry_after_seconds: 60`, and a reason distinguishing chat
request rate, process capacity, session capacity, and same-chat contention
before streaming begins.

Clear uses the same exclusive per-chat permit without waiting. It returns HTTP
409 with `{"error":"conflict: chat generation in progress"}` while generation
owns the permit. Generation acquires before context preparation and retains the
permit through the append transaction commit; provider waits hold no database
transaction or row lock.

Provider work has configured connect, total, and stream-idle timeouts. Dropping
the SSE response cancels generation as soon as the backend detects the closed
client channel. Timeout, disconnect, and provider failure do not persist partial
messages, and provider details are replaced by a generic public error.

Production reserves owner and global daily quota before the SSE response
starts. It marks the global reservation consumed immediately before provider
generation. The owner reservation is finalized in the same transaction as the
completed turn, or released if no assistant reply commits. Disconnect after
provider start therefore releases only the owner allowance; disconnect before
that durable boundary releases both.

`CHAT_OUTPUT_MAX_CHARS` counts guarded Unicode scalar values. Each complete
guarded chunk, including the response guard's buffered tail, is checked before
send. A chunk that would cross the limit is omitted in full, provider work is
canceled, the stream emits `error` with `assistant_output_size_limit`, and
neither `message_done` nor the turn is persisted. Non-streaming output uses the
same hard limit on final guarded content.

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
timezone normalization, bounded recent chat history, and automatic-memory
retrieval therefore do not vary by transport. Memory failure is fail-open and
does not alter SSE events. See [Automatic memory](automatic-memory.md).

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
