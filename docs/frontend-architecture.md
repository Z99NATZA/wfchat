# Frontend Architecture

The frontend is a standalone ReactJS + TypeScript app in `apps/web`. It is kept close to the backend in this repo, but it should behave like a deployable client that can move out later.

## API Boundary

Frontend code calls the backend through axios from `apps/web/src/services/apiClient.ts`.

```text
VITE_API_BASE_URL=http://localhost:8080
```

The frontend should not import backend code, read backend files, or know provider/model names.

## Runtime Flow

```text
apps/web/src/main.tsx
  -> apps/web/src/app/App.tsx
      -> apps/web/src/layouts/AppLayout.tsx
      -> apps/web/src/pages/ChatPage.tsx
      -> apps/web/src/pages/PngTuberPage.tsx
      -> apps/web/src/pages/Model2DPage.tsx
```

The chat UI uses `apps/web/src/features/chat/services/chatApiService.ts` to create a guest session, create/load a chat, and send messages through the Rust backend. Message sends try the SSE streaming endpoint first and fall back to the non-streaming endpoint if the stream fails before it starts.

The current supported chat companion is Aiko only. If a browser has no stored session/chat history, the message list starts empty.

The clear chat button in the header is supported. It calls `DELETE /api/chats/:chat_id/messages` after a browser confirmation and leaves the current chat/session intact.

Chat layout and scroll contract (single-scroll message timeline, sticky header/composer): `docs/chat-layout-scroll.md`.

Chat message rendering scope and rich-format rules: `docs/chat-message-rendering.md`.

Current chat message rendering is intentionally simple:

- User and assistant messages render from `ChatMessage.text`.
- Assistant streaming uses one optimistic local assistant message with id prefix `local-assistant-`.
- While that optimistic assistant message exists, the message list should render loading text inside that placeholder only when it has no token text yet, and should not render a second standalone thinking bubble.
- Markdown, tables, code block controls, assistant message actions, attachments, and rich response cards are not implemented yet. The first rich-format rendering scope is defined in `docs/chat-message-rendering.md`.

The PNGTuber workspace renders Aiko with a lightweight PNG asset set before Live2D rigging. The Live2D page is currently a route shell only. Runtime notes, chat bridge behavior, and remaining avatar work are documented in `docs/pngtuber.md`.

App-level page navigation uses the left activity bar and route map described in `docs/app-navigation.md`. The app currently supports chat, PNGTuber Studio, and a reserved Live2D workspace shell.

Auth/profile UI lives in `apps/web/src/components/auth/AuthProfileDialog.tsx`. It renders as a desktop right drawer and mobile bottom sheet, uses Google sign-in for login, and lets signed-in users edit `display_name` and `avatar_url` through `PATCH /api/auth/profile`.

App-level persisted settings live behind `apps/web/src/app/AppSettingsProvider.tsx`. Pages receive settings and callbacks from the app boundary instead of owning persisted app settings directly.

## Rules

- Keep chat UI focused on chats, characters, and messages.
- Do not expose provider, model, or API key fields in normal chat screens.
- Use admin screens for AI profile configuration later.
- Keep `VITE_*` variables limited to non-secret browser configuration.
- Put reusable browser infrastructure in `apps/web/src/services`.
- Keep unsupported controls disabled and visually muted. This currently includes attachments, voice input, image prompts, quick prompts, search, notifications, chat modes, response-shape controls, and safety toggles.
- Supported controls currently include theme toggle, settings, send message, and clear chat.
