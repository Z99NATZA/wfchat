# State Management

The project currently uses local React state because the app surface is small. This keeps debugging simple and avoids premature global state.

## Chat State

Chat screen state is isolated in `apps/web/src/features/chat/hooks/useChatSession.ts`.

It owns:

- selected persona
- message list
- composer draft
- mobile sidebar state
- send/select handlers

The hook imports chat fixtures and the companion reply service. UI components receive explicit props and do not reach into the hook directly.

## App Settings State

Theme, font, locale, background image, assistant speech visibility, assistant
speech auto-play, avatar overlay preferences, auth/profile state, and sync
orchestration are app-level state.

- `apps/web/src/app/AppSettingsProvider.tsx` exposes persisted app settings to the app tree.
- `apps/web/src/hooks/useTheme.ts` exposes React state and actions.
- `apps/web/src/stores/themeStore.ts` resolves, persists, and applies the theme.
- `apps/web/src/stores/fontStore.ts` resolves, persists, and applies the font.
- `apps/web/src/stores/backgroundStore.ts` resolves and persists the background image URL.
- `apps/web/src/stores/assistantSpeechStore.ts` resolves and persists local assistant speech visibility and auto-play preferences.
- `apps/web/src/stores/avatarOverlayStore.ts` resolves and persists local chat overlay preferences.
- `apps/web/src/services/storageService.ts` wraps browser local storage access.

This split keeps browser persistence separate from React rendering, and keeps app settings from being owned by one page such as chat.

Avatar overlay preferences are local UI preferences, not synced settings. They can be revisited later if multi-device overlay layout becomes a real requirement.

## Avatar Runtime State

Avatar runtime state is feature-level state shared across routes by `AvatarRuntimeProvider`.

- `apps/web/src/features/avatar/runtime/avatarRuntimeStore.tsx` owns the current semantic avatar state.
- `apps/web/src/features/avatar/runtime/avatarChatBridge.ts` maps chat lifecycle events into runtime updates.
- `apps/web/src/features/avatar/renderers/pngtuber/PngTuberRenderer.tsx` renders PNG-specific visuals from semantic state.

Keep runtime state renderer-neutral. It should describe `avatarId`, `rendererKind`, expression, motion, and driver, not PNG URLs, CSS classes, or Live2D file paths.

## Feature State

Feature state stays inside the feature boundary:

- Chat sessions, messages, personas, draft text, and chat memory stay in `features/chat`.
- Avatar workspace selections, pose/expression state, runtime bridge state, and inspector values should stay in the avatar page/feature.

Feature state should not be moved into app-level state unless multiple unrelated pages genuinely need to read or update it.

## When To Add A Store Library

Add a dedicated state library only when state becomes shared across unrelated pages or needs derived selectors, optimistic updates, or cache invalidation. Until then, keep state close to the feature that owns it.
