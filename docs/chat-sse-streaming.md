# Chat SSE Streaming

This document scopes the first streaming implementation for WFChat. The goal is to let the chat UI and PNGTuber avatar react while an assistant response is being generated, with the smallest practical change to the current request/response architecture.

Before implementing, read `docs/agent-work-priority.md` for the active scope and required documentation order.

## Current Flow

The current chat path is request/response:

```text
React useChatSession
  -> chatApiService.sendChatMessage()
    -> POST /api/chats/:chat_id/messages
      -> apps/api/src/chat.rs send_message()
        -> AiService::complete_chat()
          -> provider complete_chat()
        -> store.append_chat_messages(user, assistant)
      <- full message list
  -> replace local messages with server messages
  -> emit avatar assistant_replied
```

The avatar currently talks only after the full assistant response returns because the frontend only receives the assistant text at the end.

## Goal

Add an optional streaming path so the frontend can receive assistant text chunks as they are generated:

```text
React useChatSession
  -> chatApiService.streamChatMessage()
    -> POST /api/chats/:chat_id/messages/stream
      <- SSE-framed events over the fetch response body
  -> append chunks into one optimistic assistant message
  -> emit avatar talking while chunks arrive
  -> replace optimistic messages with server-confirmed messages on completion
```

The existing non-streaming endpoint stays in place. Streaming is additive, not a replacement.

## Automatic Memory Context

Streaming and non-streaming requests share the backend
`prepare_chat_completion_context()` path. Before provider generation, that path
may add one bounded `LEARNED_CONTEXT_V1` system message for the exact owner and
character:

```text
character prompt
  -> untrusted learned-context block, when relevant
  -> persisted messages from this chat
  -> latest user message
```

Memory selection happens before the SSE stream opens and does not change event
names or payloads. A memory-specific retrieval error is fail-open, so the stream
continues without learned context. Provider generation, final persistence, and
the extraction outbox retain the same success boundaries as the non-streaming
route.

## Non-Goals

- Do not add WebSocket.
- Do not add voice input, mic volume, OBS control, remote overlay control, or multi-device avatar sync.
- Do not rewrite the chat store.
- Do not add partial-message persistence in the first pass.
- Do not remove `POST /api/chats/:chat_id/messages`.
- Do not require every provider to support native streaming before the UI can use the endpoint.
- Do not put provider/model details into frontend code.

## Minimal-Change Design

### Transport

Use a `POST` endpoint that returns `text/event-stream`:

```text
POST /api/chats/:chat_id/messages/stream
Content-Type: application/json
Accept: text/event-stream
Cookie: wfchat_session=<session uuid>

{ "content": "..." }
```

This should be read with `fetch()` and `ReadableStream` on the frontend, not
`EventSource`, because the current API needs a request body and included
credentials.

The streaming route shares the chat-message rate-limit bucket with the regular
send route. If that bucket is exceeded, the backend returns `429 Too Many
Requests` with the normal JSON error body before opening an SSE stream.

### Persistence

Keep the current persistence rule for the first pass:

```text
Only append the user and assistant messages to the store after the assistant response completes successfully.
```

During streaming, the frontend owns optimistic UI state:

- local user message
- local assistant message
- appended text chunks
- sending/streaming state

On `message_done`, the backend sends the final server message list. The frontend replaces optimistic state with server-confirmed state, matching the current non-streaming behavior.

This avoids:

- partial message rows
- message update endpoints
- recovery of interrupted partial generations
- database/schema changes
- complicated sync semantics for in-flight messages

### Fallback

If native streaming is not available for a provider, the streaming endpoint may still return SSE events by calling the existing non-streaming provider method and emitting one final token-equivalent chunk before `message_done`.

This gives the frontend one streaming contract while allowing provider support to improve incrementally.

Provider support order:

1. `mock`: deterministic chunk simulation for tests and local UX.
2. OpenAI-compatible Chat Completions helper: shared by OpenAI, LM Studio, and xAI, after the Aiko response guard constraint below is handled.
3. Anthropic: later, because the adapter is currently scaffolded but not implemented.

### Aiko Response Guard Constraint

The current OpenAI-compatible path applies an Aiko-only Thai response guard after the full provider response is available:

```text
provider full response -> apply_character_response_guard() -> persist/display
```

Native provider streaming changes that timing. If raw provider tokens are forwarded directly, the UI could briefly display text before the final guard can correct it.

For the first implementation, use one of these safe options:

- Use fallback pseudo-streaming for guarded profiles: call `complete_chat()`, apply the existing guard, then emit the guarded final content as one or more SSE `token` events.
- Or implement a streaming-safe guard with a small rolling buffer before emitting chunks.

The OpenAI-compatible streaming path now uses a rolling guard for Aiko. It keeps boundary-sensitive suffixes such as `ครั` or `ครับ` buffered, applies the same Aiko guard replacements, and emits only guarded text to the frontend. This preserves current character behavior while allowing native provider streaming for Aiko.

## Backend Contract

### Route

Add a route next to the existing message route:

```rust
.route(
    "/chats/{chat_id}/messages/stream",
    axum::routing::post(stream_message),
)
```

Keep `send_message()` unchanged until the streaming path is stable.

### Response Headers

The streaming response should include:

```text
Content-Type: text/event-stream
Cache-Control: no-cache
X-Accel-Buffering: no
```

`X-Accel-Buffering: no` helps prevent proxy buffering when running behind nginx-like infrastructure.

### Event Format

Use standard SSE framing:

```text
event: <event_name>
data: <json>

```

Each event data payload is one JSON object on one logical SSE event. Do not rely on raw newline-delimited JSON without an `event:` name.

### Events

#### `message_start`

Sent after request validation and chat ownership resolution, before provider generation begins.

```json
{
  "chat_id": "uuid",
  "persona_id": "aiko"
}
```

Frontend use:

- confirm stream started
- keep local user message
- create or keep local assistant placeholder
- notify avatar that assistant is generating

#### `token`

Sent for each assistant text chunk.

```json
{
  "text": "partial text"
}
```

Frontend use:

- append `text` to the local assistant message
- notify avatar that assistant is talking

Rules:

- `text` may be an empty string only if a provider emits a keepalive-like delta; frontend should ignore empty text.
- token boundaries are provider-dependent and must not be treated as words.
- frontend must concatenate tokens into one assistant message.

#### `message_done`

Sent after the backend has the complete assistant content and has successfully appended the user and assistant messages to the store.

```json
{
  "chat_id": "uuid",
  "user_message": {
    "id": "uuid",
    "role": "user",
    "content": "original user message",
    "created_at": 1780325400
  },
  "assistant_message": {
    "id": "uuid",
    "role": "assistant",
    "content": "complete assistant response",
    "created_at": 1780325401
  },
  "messages": []
}
```

`messages` should match the existing `SendMessageResponse.messages` shape. Sending the full list lets the frontend reuse its current replacement behavior.

Frontend use:

- replace optimistic messages with `messages`
- update chat session summary
- infer final avatar expression from `assistant_message.content`
- schedule avatar idle transition through the existing bridge

#### `error`

Sent when the backend can still write an SSE error event.

```json
{
  "message": "provider returned 401"
}
```

Frontend use:

- remove local optimistic user/assistant messages, matching current request/response error behavior
- show existing AI error text
- notify avatar `assistant_error`

Do not expose provider secrets or raw credentials in the error message.

### Provider Interface

Add a streaming API without removing `complete_chat()`:

```rust
pub enum AiChatStreamEvent {
    Token(String),
}

pub async fn stream_chat(
    &self,
    ai_profile_id: &str,
    messages: &[AiMessage],
    on_event: impl FnMut(AiChatStreamEvent) -> Future<Output = AppResult<()>>,
) -> AppResult<AiMessage>
```

The exact Rust shape can change during implementation, but the semantic contract should stay:

- stream token events as they arrive
- return the final `AiMessage` at the end
- apply the same character response guard as non-streaming before persistence
- do not emit unguarded provider text for guarded profiles

For OpenAI-compatible providers, request payload should add:

```json
{
  "stream": true
}
```

For the first pass, it is acceptable to implement a fallback helper:

```text
call complete_chat()
emit one token containing full assistant content
return assistant message
```

This keeps frontend work unblocked while provider-native streaming is added.

## Frontend Contract

### Service

Add a streaming function next to `sendChatMessage()`:

```ts
type StreamChatMessageHandlers = {
  onStart?: (event: StreamMessageStartEvent) => void;
  onToken?: (text: string) => void;
  onDone?: (event: StreamMessageDoneEvent) => void;
  onError?: (message: string) => void;
};

export async function streamChatMessage(
  chatId: string,
  content: string,
  handlers: StreamChatMessageHandlers
): Promise<void>;
```

Implementation notes:

- call `ensureCookieSession()` before the stream request and include browser
  credentials
- use `fetch` or Axios response streaming only if browser support is confirmed; plain `fetch` is the likely minimal path
- parse SSE frames from `response.body.getReader()`
- keep `sendChatMessage()` unchanged as fallback

### Hook State

`useChatSession.sendMessage()` should keep the current optimistic user message behavior and add an optimistic assistant message when streaming starts or on first token.

Recommended local assistant message:

```ts
{
  id: `local-assistant-${Date.now()}`,
  author: "companion",
  text: "",
  createdAt,
  time
}
```

Chunk handling:

```text
onToken(text)
  -> append text to the local assistant message
  -> emit avatar event for talking/streaming
```

Completion handling:

```text
onDone(event)
  -> setMessages(event.messages.map(toChatMessage))
  -> update sessions from final assistant content
  -> emit avatar assistant_replied with final assistant content
  -> setIsSending(false)
```

Error handling should match current behavior as closely as possible:

```text
onError or thrown stream error
  -> if a new chat was created, delete it
  -> remove local optimistic messages
  -> show existing aiNoResponse error
  -> emit avatar assistant_error
  -> setIsSending(false)
```

### Avatar Events

The current avatar events are:

```ts
assistant_waiting
assistant_replied
assistant_error
```

For minimal changes, do not add a new avatar runtime state. Add at most one chat lifecycle event only if needed:

```ts
assistant_streaming
```

Recommended first implementation:

- existing `assistant_waiting` when request begins: `thinking`
- first non-empty token: either reuse `assistant_replied` only at the end, or add `assistant_streaming` to switch to `talking`
- `message_done`: existing `assistant_replied` with final text, then idle delay
- error: existing `assistant_error`

If `assistant_streaming` is added, it should be semantic and renderer-neutral:

```ts
{ type: "assistant_streaming"; chatId: string; personaId: string }
```

Bridge mapping:

```text
assistant_waiting   -> default expression + thinking
assistant_streaming -> current/default expression + talking
assistant_replied   -> inferred expression + talking, then idle
assistant_error     -> error expression + idle
```

## Implementation Plan

Keep the work in small commits.

### 1. Backend SSE shell - Implemented

Files:

- `apps/api/src/chat.rs`
- `apps/api/Cargo.toml`
- `Cargo.lock`

Add `POST /api/chats/{chat_id}/messages/stream`.

At first, the handler may call `AiService::complete_chat()` and emit:

```text
message_start
token      full assistant content
message_done
```

This proves the end-to-end frontend contract without provider-native streaming.

Current backend shell behavior:

- returns `text/event-stream`
- emits `message_start`
- emits one guarded full-content `token`
- emits `message_done` with the full persisted message list
- sends sanitized SSE `error` messages for upstream AI failures
- keeps the original non-streaming endpoint unchanged

### 2. Frontend SSE parser and service - Implemented

Files:

- `apps/web/src/features/chat/services/chatApiService.ts`
- `apps/web/src/features/chat/services/chatApiService.test.ts`
- `apps/web/src/services/apiClient.ts`

Add a small SSE parser local to the service file unless it becomes shared.

Keep the existing Axios `apiClient` for non-streaming calls. Use `fetch` for streaming because the response body must be read incrementally.

Current service behavior:

- `streamChatMessage()` calls the backend SSE route with `fetch`
- existing `sendChatMessage()` remains unchanged
- parser supports split frames, CRLF framing, comments, multi-line data, and final frames without trailing blank lines
- `message_done` maps API messages into existing `ChatMessage` objects
- `error` events call `onError` and throw

### 3. Hook integration behind one path - Implemented

Files:

- `apps/web/src/features/chat/hooks/useChatSession.ts`

Switch `sendMessage()` to call `streamChatMessage()` if available. Keep a fallback to `sendChatMessage()` in the same function, so a streaming regression can fall back without losing chat.

Current hook behavior:

- creates the existing optimistic user message immediately
- starts `streamChatMessage()` after chat creation or route resolution
- creates one optimistic assistant placeholder on `message_start`
- appends `token` text into that assistant message
- replaces local optimistic messages with server-confirmed messages on `message_done`
- falls back to `sendChatMessage()` when the stream fails before `message_start`

Current message-list behavior:

- renders the standalone thinking bubble only before an optimistic assistant placeholder exists
- treats `local-assistant-*` companion messages as the active streaming assistant placeholder
- renders the thinking text inside an empty streaming assistant placeholder until the first token arrives
- avoids showing both a streaming assistant placeholder and a separate thinking bubble at the same time

### 4. Avatar streaming event - Implemented

Files:

- `apps/web/src/features/chat/hooks/useChatSession.ts`
- `apps/web/src/features/avatar/runtime/avatarChatBridge.ts`

Add `assistant_streaming` only if using first-token talking cannot be cleanly represented with current events.

Current behavior:

- `assistant_waiting` moves the avatar into thinking
- the first non-empty `token` emits `assistant_streaming`
- `assistant_streaming` moves the avatar into talking using the bound avatar default expression
- `assistant_replied` still infers the final expression from the completed assistant text and schedules the idle transition

### 5. Provider-native streaming - Implemented

Files:

- `apps/api/src/ai/mod.rs`
- `apps/api/src/ai/providers/openai.rs`
- `apps/api/src/ai/providers/lmstudio.rs`
- `apps/api/src/ai/providers/xai.rs`
- `apps/api/src/ai/providers/mock.rs`

Add native streaming to the OpenAI-compatible helper. LM Studio and xAI inherit it because they already route through the same helper.

Keep fallback behavior for providers that do not support streaming yet, and for guarded profiles until token emission is guard-safe.

Current provider streaming behavior:

- `AiService::stream_chat()` is available next to `complete_chat()`
- `mock` streams deterministic chunks with a short delay for local QA
- OpenAI-compatible providers parse provider SSE chunks and emit `token` events
- Aiko/guarded profiles use the streaming-safe rolling response guard before any token is emitted
- parser tests cover normal token frames, `[DONE]`, role-only deltas, malformed JSON, empty final content, and Aiko guard chunk boundaries
- the chat streaming route persists messages only after `stream_chat()` returns the final assistant message

## Testing Plan

### Backend

- Empty message returns the same bad request behavior as non-streaming.
- Unknown chat returns not found before opening a stream.
- `mock` provider emits valid SSE frames.
- `message_done` persists exactly one user message and one assistant message.
- If provider fails before completion, no partial assistant message is persisted.

Current automated coverage:

- Provider stream parser and Aiko streaming guard unit tests are implemented in `apps/api/src/ai/providers/openai.rs`.
- SSE stream error sanitization unit tests are implemented in `apps/api/src/chat.rs`.
- A mock-provider endpoint integration test is implemented in `apps/api/src/chat.rs` and runs when `WFCHAT_TEST_DATABASE_URL` is set. It verifies response headers, `message_start`, `token`, `message_done`, final assistant content, and persisted user/assistant messages.
- A provider-failure endpoint integration test is implemented in `apps/api/src/chat.rs` and runs when `WFCHAT_TEST_DATABASE_URL` is set. It uses OpenAI provider config without an API key to verify `message_start`, sanitized `error`, no raw upstream/config details in the SSE body, no `message_done`, and no persisted messages.

### Frontend

- SSE parser handles frames split across reader chunks.
- `token` events append to one assistant message.
- `message_done` replaces optimistic messages with server messages.
- stream error removes optimistic messages and shows existing error state.
- avatar enters talking on stream token or `assistant_streaming`.
- avatar returns idle after final reply behavior.

Current automated coverage:

- SSE parser tests in `apps/web/src/features/chat/services/chatApiService.test.ts` cover split frames, CRLF framing, comments, multi-line data, and final frames without trailing blank lines.
- Hook tests in `apps/web/src/features/chat/hooks/useChatSession.test.ts` cover optimistic assistant creation, token append, final server replacement, stream-started error cleanup, avatar lifecycle events, and pre-start non-streaming fallback.
- Message list tests in `apps/web/src/features/chat/components/ChatMessageList.test.tsx` cover the streaming placeholder versus thinking-bubble loading states.

Recommended next automated coverage:

- Add backend validation tests for empty message and unknown chat only if the next work changes request validation or ownership behavior.

### Manual QA

1. Start Docker or local dev.
2. Set `AI_PROVIDER=mock`.
3. Send a message in chat.
4. Confirm assistant text appears progressively or via the streaming contract.
5. Confirm avatar changes to thinking, then talking, then idle.
6. Refresh `/chat/:chatId`.
7. Confirm the final persisted messages load correctly.

## Open Questions

- Should the first backend shell emit one full token immediately, or should mock split text into delayed chunks to exercise UI animation?
- Should streaming be always on once implemented, or guarded by a frontend constant during rollout?
- Should final `message_done.messages` always include the full message list, or can later versions send only the two created messages?

Recommended defaults:

- mock should split into delayed chunks for better local QA
- frontend can attempt streaming first and fall back to non-streaming on transport failure
- first pass should send the full message list to reuse current frontend replacement logic

## Completion Criteria

The first SSE iteration is complete when:

- existing request/response chat still works
- streaming endpoint returns valid SSE-framed events
- frontend can display assistant text before `message_done`
- final messages persist only after successful completion
- avatar talks while streaming and idles after completion
- docs/pngtuber.md can mark SSE/token streaming as implemented

Current status: implemented for the first SSE iteration.
