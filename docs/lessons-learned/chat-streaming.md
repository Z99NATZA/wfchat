# Chat Streaming Lessons Learned

## 2026-07-11 - Separate preparation paths produced transport drift

Context:
- Streaming and non-streaming sends needed equivalent provider context.

Failed approach:
- Context preparation could be added independently inside each completion path.

Problem observed:
- Equivalent sends could receive different learned context, prompt ordering, or
  budget behavior depending on transport.

Root cause:
- Transport-specific orchestration owned domain preparation.

Lesson:
- Do not duplicate provider-context preparation across streaming and
  non-streaming paths.

## 2026-07-03 - Message append and attachment linking were partially durable

Context:
- One accepted image message needed to persist user text, assistant text, and
  attachment ownership.

Failed approach:
- Messages were inserted before pending attachments were fully validated and
  linked, without one rollback boundary.

Problem observed:
- Incomplete linking could leave partial chat state or consume an attachment
  without a coherent completed turn.

Root cause:
- A single domain operation was split across independently durable writes.

Lesson:
- Do not persist a multi-part accepted chat turn without one atomic boundary.
