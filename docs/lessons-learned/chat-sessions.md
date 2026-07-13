# Chat Session Lessons Learned

## 2026-07-13 - Empty route hydration removed the first optimistic message

Context:
- A user sent the first message from the `/chat` draft route.

Failed approach:
- After creating a chat and changing the URL, route synchronization immediately
  loaded the newly created empty chat and replaced local message state.

Problem observed:
- The first user bubble disappeared until the assistant response completed.

Root cause:
- Empty server hydration raced with an in-flight optimistic operation for the
  same newly created chat.

Lesson:
- Do not let initial empty hydration overwrite optimistic state owned by an
  in-flight chat creation.

## 2026-07-13 - Deleting the active chat selected another conversation

Context:
- A user deleted the conversation currently open in the chat workspace.

Failed approach:
- The client automatically selected the first remaining session after deletion.

Problem observed:
- A destructive action unexpectedly opened another conversation instead of
  leaving a fresh chat workspace.

Root cause:
- Session-list fallback order was treated as navigation intent.

Lesson:
- Do not infer that deleting the active conversation means the user wants to
  enter another existing conversation.
