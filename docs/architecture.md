# Architecture

WFChat is organized around a small feature-first frontend architecture. The application shell stays thin, feature behavior lives inside feature folders, and shared primitives stay isolated.

## Principles

- Keep files readable without forcing excessive jumps.
- Put feature-specific UI, data, hooks, and services inside the feature boundary.
- Put reusable UI in `src/components`.
- Put app-wide state helpers in `src/stores`.
- Put browser and infrastructure helpers in `src/services`.
- Put pure helpers in `src/utils`.
- Put cross-feature TypeScript models in `src/types`.

## Runtime Flow

1. `src/main.tsx` mounts React and imports global styles.
2. `src/app/App.tsx` initializes app-level theme state.
3. `src/pages/ChatPage.tsx` composes the chat screen.
4. `src/features/chat/hooks/useChatSession.ts` owns the chat screen state.
5. Feature components render the chat sidebar, header, messages, composer, and details panel.

## Feature Boundaries

The chat feature owns chat-specific behavior:

- chat fixtures
- chat state hook
- companion reply service
- chat-only components

Shared layers should not import from feature components. Feature modules may import shared UI, hooks, utilities, services, and types.

## Dependency Direction

Use this direction for imports:

```text
app -> pages -> layouts/features -> components/hooks/services/stores/utils/types
```

Avoid importing upward. For example, `components/ui` should not import from `features/chat`.
