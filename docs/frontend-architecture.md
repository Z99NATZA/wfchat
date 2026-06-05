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
      -> apps/web/src/pages/Model3DPage.tsx
```

The chat UI uses `apps/web/src/features/chat/services/chatApiService.ts` to create a guest session, create/load a chat, and send messages through the Rust backend.

The current supported chat companion is Aiko only. If a browser has no stored session/chat history, the message list starts empty.

The clear chat button in the header is supported. It calls `DELETE /api/chats/:chat_id/messages` after a browser confirmation and leaves the current chat/session intact.

Chat layout and scroll contract (single-scroll message timeline, sticky header/composer): `docs/chat-layout-scroll.md`.

App-level page navigation uses the left activity bar described in `docs/app-navigation.md`. It currently switches between the chat workspace and a mock 3D model workspace without adding a router library.

Auth/profile UI lives in `apps/web/src/components/auth/AuthProfileDialog.tsx`. It renders as a desktop right drawer and mobile bottom sheet, uses Google sign-in for login, and lets signed-in users edit `display_name` and `avatar_url` through `PATCH /api/auth/profile`.

## Rules

- Keep chat UI focused on chats, characters, and messages.
- Do not expose provider, model, or API key fields in normal chat screens.
- Use admin screens for AI profile configuration later.
- Keep `VITE_*` variables limited to non-secret browser configuration.
- Put reusable browser infrastructure in `apps/web/src/services`.
- Keep unsupported controls disabled and visually muted. This currently includes attachments, voice input, image prompts, quick prompts, search, notifications, settings, chat modes, memory, response-shape controls, and safety toggles. Theme toggle, send message, and clear chat are supported controls.
