# Aiko PNGTuber

The PNGTuber stack is the current real avatar implementation for Aiko. Live2D has a separate route shell, but no Live2D runtime is loaded yet.

## Current Status

Implemented:

- PNGTuber Studio page at `/avatar/pngtuber`.
- Live2D workspace shell at `/model/live2d`.
- Shared avatar runtime provider mounted above routes.
- PNG renderer split into `PngTuberRenderer`.
- Chat-to-avatar bridge wired from `ChatPage` to `useChatSession`.
- Chat overlay using the same runtime and renderer.
- Overlay visibility, position, and size settings persisted locally.
- Chat reply emotion inference with a small conservative heuristic.
- Chat reply emotion inference split into a pure helper with focused unit tests.
- Renderer-level expression transition polish with reduced-motion support.

Not implemented:

- Live2D model loading, physics, motion priority, lip-sync, or runtime package.
- SSE/token streaming for talking while the AI response is still generating.
- Multi-persona avatar binding configuration.
- User-uploaded/custom PNG asset management.

## Runtime Files

- UI page: `apps/web/src/pages/PngTuberPage.tsx`
- Live2D shell page: `apps/web/src/pages/Model2DPage.tsx`
- PNGTuber metadata: `apps/web/src/features/avatar/data/aikoPngTuber.ts`
- Runtime store: `apps/web/src/features/avatar/runtime/avatarRuntimeStore.tsx`
- Runtime types: `apps/web/src/features/avatar/runtime/avatarRuntimeTypes.ts`
- Chat bridge: `apps/web/src/features/avatar/runtime/avatarChatBridge.ts`
- Emotion inference helper: `apps/web/src/features/avatar/runtime/avatarEmotionInference.ts`
- Chat overlay: `apps/web/src/features/avatar/components/AvatarOverlay.tsx`
- PNGTuber renderer: `apps/web/src/features/avatar/renderers/pngtuber/PngTuberRenderer.tsx`
- Overlay settings store: `apps/web/src/stores/avatarOverlayStore.ts`
- Shared animation styles: `apps/web/src/styles.css`
- Public assets: `apps/web/public/images/aiko-pngtuber/`

## Asset Set

```text
apps/web/public/images/aiko-pngtuber/
  aiko-neutral.png
  aiko-happy.png
  aiko-shy.png
  aiko-sad.png
  aiko-surprised.png
```

Keep all expression files in the same general crop and character scale. Do not overwrite generated assets; add a new filename and update `aikoPngTuber.ts`.

## Runtime Contract

The app keeps semantic avatar state in `AvatarRuntimeProvider`, mounted in `apps/web/src/app/App.tsx` above both chat and avatar routes:

```ts
type AvatarRuntimeState = {
  avatarId: string;
  rendererKind: "pngtuber" | "live2d";
  expressionId: string;
  motionState: "idle" | "thinking" | "talking";
  drivenBy: "manual" | "chat-bridge";
};
```

Keep runtime state semantic. It should not contain PNG URLs, CSS class names, Live2D file paths, physics parameters, or renderer-specific motion names.

## Page Boundaries

`PngTuberPage` owns the PNGTuber Studio layout, sidebar, controls, and inspector UI.

`PngTuberRenderer` owns only the visual performer. It receives a resolved emotion and motion state, then renders the PNG asset and CSS animations.

`ChatPage` owns chat layout and emits chat lifecycle events through `useChatSession({ onAvatarChatEvent })`.

`avatarChatBridge.ts` translates chat lifecycle events into semantic avatar state. Chat code should not import PNG metadata or renderer-specific components.

`Model2DPage` is a separate Live2D workspace shell. It exists to keep future 2D model work out of the PNGTuber page.

## Current Behavior

Motion mapping:

```text
assistant_waiting -> neutral + thinking
assistant_replied -> inferred expression + talking, then idle
assistant_error   -> sad + idle
```

Expression inference currently lives in `avatarEmotionInference.ts` as a small keyword heuristic. It maps only to known expressions: `neutral`, `happy`, `shy`, `sad`, and `surprised`. If no rule matches, it defaults to `neutral`.

Manual motion controls in PNGTuber Studio can preview idle, thinking, and talking. They update the shared runtime, so the chat overlay reflects the same selected motion while the app remains mounted.

Expression changes use a short fade/scale transition in `PngTuberRenderer`. Motion loops run on the image element while expression transitions run on the wrapper, so the animations do not override each other's transforms. PNGTuber animations respect reduced-motion preferences.

## Chat Overlay Settings

Overlay settings are controlled from the app settings dialog and persisted locally:

```text
wfchat.avatarOverlayVisible
wfchat.avatarOverlayPosition
wfchat.avatarOverlaySize
```

The overlay can be hidden or moved without changing chat behavior. The bridge should continue updating runtime state even when the overlay is hidden.

## Deferred Transport Work

Do not start with WebSocket for the current PNGTuber work. The chat flow is still request/response, so the bridge can run from existing `sendMessage()` lifecycle events.

Preferred transport order:

```text
runtime store -> renderer split -> chat bridge -> chat overlay -> SSE/token streaming -> WebSocket if needed
```

Use SSE first if the next need is one-way AI response streaming. Reserve WebSocket for bidirectional realtime features such as voice input, live mic volume, remote overlay control, OBS control, or multi-device avatar synchronization.

## Remaining Work

Useful next stations:

- Add avatar binding config for multiple personas.
- Add compact/mobile overlay behavior if mobile chat needs the performer.
- Add SSE/token streaming so the avatar talks while AI text is streaming.
- Add PNG asset management only when there are real custom assets to manage.

Pause Live2D runtime work until real model assets and runtime decisions exist. Future Live2D implementation should live under a separate `renderers/live2d/` module while sharing the same semantic avatar runtime state.
