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
2. Next: frontend SSE parser and `streamChatMessage()` service.
3. Then: `useChatSession` integration with optimistic assistant message updates.
4. Then: avatar streaming lifecycle event only if needed.
5. Later: provider-native streaming after the contract is proven.

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
- uses the existing `AiService::complete_chat()` path
- emits guarded final assistant text as one `token`
- persists user and assistant messages only after successful completion
- keeps `POST /api/chats/:chat_id/messages` unchanged

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

Use the conservative first-pass behavior from `docs/chat-sse-streaming.md`:

```text
provider full response -> apply existing guard -> emit guarded text through SSE
```

This preserves current Aiko behavior while still allowing the UI and avatar to use the SSE lifecycle.

## Completion Signal

The SSE milestone is complete only when:

- existing non-streaming chat still works
- streaming endpoint returns valid SSE events
- frontend renders assistant text during the stream path
- final messages are persisted only after successful completion
- avatar enters talking during streaming and idles after completion
- `docs/pngtuber.md` marks SSE/token streaming as implemented
