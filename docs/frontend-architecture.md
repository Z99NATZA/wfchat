# Frontend Architecture

The frontend is a standalone React app in `apps/web`. It is kept close to the backend in this repo, but it should behave like a deployable client that can move out later.

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
    -> apps/web/src/pages/ChatPage.tsx
      -> apps/web/src/features/chat
```

The current chat UI still uses local fixture/reply behavior. Backend integration should happen through feature-local services that call the shared axios client.

## Rules

- Keep chat UI focused on chats, characters, and messages.
- Do not expose provider, model, or API key fields in normal chat screens.
- Use admin screens for AI profile configuration later.
- Keep `VITE_*` variables limited to non-secret browser configuration.
- Put reusable browser infrastructure in `apps/web/src/services`.
