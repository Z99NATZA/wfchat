# Chat Scroll Behavior History

This file records scroll behavior decisions for the chat timeline. The current
behavior contract lives in `docs/chat-layout-scroll.md`; read that first when
implementing chat scroll changes.

## 2026-06-20 - Reset timeline state when switching active chats

Status: Active

Previous behavior:
- `ChatMessageList` kept transient scroll and virtualization state inside the component while the active chat changed.
- If the user scrolled upward in one chat, the next selected chat could inherit non-bottom state from the previous chat.

Problem observed:
- Switching chats after reading older messages could leave the newly selected chat away from its latest loaded message.
- The inherited state could make the new chat appear stale or incorrectly positioned, because the user intent after selecting a different chat is to view that chat's latest loaded state.

Decision:
- Treat active chat changes as a navigation boundary.
- Pass the active chat id into `ChatMessageList`.
- Reset transient timeline state when the active chat changes, including measured row heights, hidden optimistic user messages, active message menus, copy state, jump-to-latest visibility, unseen count, and scroll position.
- Scroll directly to the latest loaded message with `behavior: "auto"` after the active chat changes.

Why:
- A reading offset belongs to the chat where it was created. Reusing that offset across chats couples unrelated conversations and can hide the latest message in the newly selected chat.
- The direct `auto` scroll avoids smooth-scroll animation from an inherited offset during navigation.

Regression guard:
- `apps/web/src/features/chat/components/ChatMessageList.test.tsx` covers switching chats after the user scrolled upward and expects a direct scroll to the latest message.
- `npm --prefix apps/web test`
- `npm run build:web`

Related current contract:
- `docs/chat-layout-scroll.md`

Related implementation:
- `apps/web/src/features/chat/components/ChatMessageList.tsx`
- `apps/web/src/pages/ChatPage.tsx`
