# State Management

WFChat uses React state, contexts, refs, and small browser-persistence modules;
it does not use a general-purpose state library.

## Ownership

| State | Owner |
| --- | --- |
| Theme, font, background, speech visibility/auto-play, overlay settings | `AppSettingsProvider` plus `stores/*` |
| Auth/profile lifecycle | `useAuthSession` |
| Sync queue/pull/cache orchestration | `App.tsx` and `syncService.ts` |
| Chats, route hydration, messages, draft, attachments, voice interaction | `useChatSession` and feature hooks |
| Semantic avatar expression/motion | `AvatarRuntimeProvider` |
| Cafe lobby | `CafePage` |
| Cafe socket snapshots/dialogue/rewards | `useCafeRoom` |
| Phaser objects, predicted movement, rendering | `CafeScene` |

Browser stores handle serialization, validation, and document effects; React
providers expose render-facing values and callbacks. Components do not read
feature hooks or localStorage directly when their owner can pass explicit props.

Avatar runtime state remains renderer-neutral: avatar id, renderer kind,
expression, motion, and driver. PNG URLs, CSS classes, and Live2D paths belong
to renderers or metadata.

Avatar overlay settings are local-only. Theme, font, locale, and background are
eligible for generic sync. Cafe progress and automatic memory are backend-owned
and bypass browser sync.

Keep new state at the narrowest owner. Add a dedicated state library only when
unrelated routes need shared derived selectors, cache invalidation, or complex
optimistic updates that the existing boundaries cannot express clearly.
