# Agent Work Priority

Use this file as the first document to read before continuing PNGTuber or chat streaming work. It defines the active scope and the required documentation read order for agents.

## Active Scope

Current focus:

```text
Implement chat SSE/token streaming so the PNGTuber avatar can talk while the assistant response is being generated.
```

This work belongs to the PNGTuber roadmap, but the implementation is full-stack chat transport work.

Expected impact areas:

- Rust API chat route
- Rust AI provider layer
- frontend chat API service
- frontend chat session hook
- avatar chat bridge lifecycle

## Required Read Order

Read these documents in order before implementing:

1. `docs/agent-work-priority.md`
2. `docs/pngtuber.md`
3. `docs/chat-sse-streaming.md`
4. `docs/chat-sessions.md`
5. `docs/backend-architecture.md`

Read these only when touching related areas:

- `docs/characters.md` when changing character behavior, Aiko prompt behavior, or response guard behavior.
- `docs/frontend-architecture.md` when changing shared frontend layout/state patterns.
- `docs/sync-system.md` when changing persisted chat/memory/sync semantics.
- `docs/database-schema.md` when changing database tables or migrations.

## Current Implementation Priority

Follow the sequence from `docs/chat-sse-streaming.md`:

1. Completed: backend SSE shell using the existing non-streaming completion path.
2. Completed: frontend SSE parser and `streamChatMessage()` service.
3. Completed: `useChatSession` integration with optimistic assistant message updates.
4. Completed: avatar streaming lifecycle event for first-token talking.
5. Completed: provider-native streaming after the contract is proven.

The first working version may use pseudo-streaming:

```text
complete_chat() -> emit guarded final text as SSE token(s) -> message_done
```

This is intentional. It proves the frontend and avatar contract without forcing native provider streaming in the first pass.

## Current Backend Status

The backend shell exists at:

```text
POST /api/chats/:chat_id/messages/stream
```

Current behavior:

- validates session, chat ownership, and non-empty content before opening the stream
- returns SSE-framed `message_start`, `token`, and `message_done`
- uses `AiService::stream_chat()` for the streaming endpoint
- emits mock provider chunks for local QA
- uses OpenAI-compatible native streaming for unguarded profiles
- uses a streaming-safe Aiko response guard before emitting guarded native provider tokens
- covers provider stream parser edge cases with focused unit tests
- persists user and assistant messages only after successful completion
- keeps `POST /api/chats/:chat_id/messages` unchanged

## Current Frontend Service Status

The frontend service layer now has:

```text
streamChatMessage(chatId, content, handlers)
```

Current behavior:

- uses `fetch()` against `POST /api/chats/:chat_id/messages/stream`
- sends the existing `X-WFChat-Session` header
- parses SSE frames from `ReadableStream`
- handles frames split across chunks
- maps `message_start`, `token`, `message_done`, and `error`
- keeps `sendChatMessage()` unchanged

The service is wired into `useChatSession.sendMessage()`.

## Current Hook Status

`useChatSession.sendMessage()` now attempts the streaming path first:

- keeps the existing optimistic user message behavior
- creates one optimistic assistant message when the stream starts
- appends `token` event text into that assistant message
- emits `assistant_streaming` on the first non-empty token so the avatar can talk before final completion
- replaces optimistic messages with server-confirmed messages on `message_done`
- falls back to the existing non-streaming `sendChatMessage()` path only when the stream fails before the backend starts streaming

## Hard Boundaries

Do not implement these as part of the first SSE pass:

- WebSocket transport
- voice input
- mic volume tracking
- OBS control
- remote overlay control
- partial-message persistence
- chat store rewrite
- Live2D runtime
- PNG asset upload/management

Do not remove or replace:

- `POST /api/chats/:chat_id/messages`
- existing request/response chat behavior
- existing semantic avatar runtime contract

## Guard Constraint

For Aiko, do not stream raw provider tokens to the UI unless the response guard is streaming-safe.

The OpenAI-compatible provider path now uses a rolling streaming guard:

```text
provider token -> hold boundary-sensitive suffix -> apply Aiko guard -> emit guarded SSE token
```

This preserves the current Aiko guard behavior while allowing native stream tokens to reach the UI after guard processing.

## Completion Signal

The SSE milestone is complete only when:

- existing non-streaming chat still works
- streaming endpoint returns valid SSE events
- frontend renders assistant text during the stream path
- final messages are persisted only after successful completion
- avatar enters talking during streaming and idles after completion
- `docs/pngtuber.md` marks SSE/token streaming as implemented

Current status: complete for the first SSE iteration. Future work should be scoped separately unless it directly hardens this transport.
