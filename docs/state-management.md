# State Management

The project currently uses local React state because the app surface is small. This keeps debugging simple and avoids premature global state.

## Chat State

Chat screen state is isolated in `src/features/chat/hooks/useChatSession.ts`.

It owns:

- selected persona
- message list
- composer draft
- mobile sidebar state
- send/select handlers

The hook imports chat fixtures and the companion reply service. UI components receive explicit props and do not reach into the hook directly.

## Theme State

Theme state is app-level state.

- `src/hooks/useTheme.ts` exposes React state and actions.
- `src/stores/themeStore.ts` resolves, persists, and applies the theme.
- `src/services/storageService.ts` wraps browser local storage access.

This split keeps browser persistence separate from React rendering.

## When To Add A Store Library

Add a dedicated state library only when state becomes shared across unrelated pages or needs derived selectors, optimistic updates, or cache invalidation. Until then, keep state close to the feature that owns it.
