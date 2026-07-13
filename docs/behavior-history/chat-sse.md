# Chat SSE Behavior History

## 2026-07-11 - Share automatic-memory preparation across chat paths

Status: Active

Previous behavior:
- Streaming and non-streaming shared stored chat preparation, but no learned
  cross-chat context was available.

Problem observed:
- Adding retrieval inside only one completion function could make equivalent
  requests behave differently and complicate SSE fallback behavior.

Decision:
- Retrieve and inject bounded memory in the shared
  `prepare_chat_completion_context()` function before either completion path.
- Keep SSE events and final persistence unchanged, and fail open without memory
  on a retrieval-specific error.

Why:
- Both transports now send identical ordered provider context while preserving
  the existing streaming contract.

Regression guard:
- `chat::tests::streaming_and_non_streaming_share_bounded_memory_context_preparation`
- `ai::providers::openai::tests::build_messages_places_memory_context_after_character_prompt`

Related current contract:
- `docs/chat-sse-streaming.md`
- `docs/automatic-memory.md`

Related implementation:
- `apps/api/src/chat/messages.rs`
- `apps/api/src/memory.rs`

## 2026-07-03 - Atomic chat append with attachments

Status: Active

Previous behavior:
- Chat append inserted user and assistant messages before linking pending image
  attachments and updating the chat timestamp.
- If attachment linking failed after message insert, the database could keep
  messages without the requested attachment links.

Problem observed:
- Multi-step chat persistence could leave partial state after an incomplete
  attachment link.

Decision:
- Persist the user message, assistant message, pending attachment links, and
  chat timestamp in one SQL transaction.
- If any requested attachment cannot be linked, roll back the full append and
  leave attachments pending.

Why:
- A message send should be stored as one coherent unit. Partial persistence is
  harder for users to recover from and harder for sync to reason about later.

Regression guard:
- `store::integration_tests::append_chat_messages_rolls_back_when_attachment_linking_is_incomplete`
  verifies messages are not persisted and the valid attachment remains pending
  when the requested attachment set cannot be fully linked.

Related current contract:
- `docs/chat-image-attachments.md`

Related implementation:
- `apps/api/src/store/chat.rs`
