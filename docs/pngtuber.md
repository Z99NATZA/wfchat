# Aiko PNGTuber

The PNGTuber workspace supports the first lightweight visual implementation for Aiko before Live2D rigging is available.

## Runtime Files

- UI page: `apps/web/src/pages/PngTuberPage.tsx`
- PNGTuber metadata: `apps/web/src/features/avatar/data/aikoPngTuber.ts`
- Runtime store: `apps/web/src/features/avatar/runtime/avatarRuntimeStore.tsx`
- Runtime types: `apps/web/src/features/avatar/runtime/avatarRuntimeTypes.ts`
- Chat bridge: `apps/web/src/features/avatar/runtime/avatarChatBridge.ts`
- Chat overlay: `apps/web/src/features/avatar/components/AvatarOverlay.tsx`
- PNGTuber renderer: `apps/web/src/features/avatar/renderers/pngtuber/PngTuberRenderer.tsx`
- Shared animation styles: `apps/web/src/styles.css`
- Public assets: `apps/web/public/images/aiko-pngtuber/`

## Current Asset Set

```text
apps/web/public/images/aiko-pngtuber/
  aiko-neutral.png
  aiko-happy.png
  aiko-shy.png
  aiko-sad.png
  aiko-surprised.png
```

These are transparent PNG cutouts generated from chroma-key sources. The original generated source files remain under the local Codex generated-images directory and are not referenced by the app.

## Interaction Model

The app keeps current avatar state in `AvatarRuntimeProvider`, mounted above routes in `apps/web/src/app/App.tsx`:

```ts
type AvatarRuntimeState = {
  avatarId: string;
  rendererKind: "pngtuber" | "live2d";
  expressionId: string;
  motionState: "idle" | "thinking" | "talking";
  drivenBy: "manual" | "chat-bridge";
};
```

`PngTuberPage` owns the studio layout and controls. `PngTuberRenderer` owns the image rendering and renderer-specific animation class selection.

The studio toolbar can manually preview all supported motion states: idle, thinking, and talking. These controls update the shared avatar runtime state, so the chat overlay reflects the same selected motion while the app remains mounted.

The renderer currently applies one of three CSS animation loops:

- idle: slow breathing motion
- thinking: subtle tilted thinking motion
- talking: slightly faster bob motion

`thinking` is triggered by the chat bridge while the app waits for an AI response.

The `AI state bridge` asset shown in the sidebar is a marker only. It reserves the product location for later chat-driven state without coupling the PNGTuber page to chat transport yet.

## Future Chat Bridge

When connecting chat events to the visual performer, keep the state bridge small:

```text
chat request starts        -> neutral + idle
AI is generating           -> neutral + idle or thinking
AI response streaming      -> selected emotion + talking
AI response complete       -> selected emotion + idle
```

Emotion selection should be derived from message metadata or a small classifier result, not from raw UI text parsing inside `PngTuberPage`.

Recommended future metadata:

```ts
type AvatarRuntimeState = {
  avatarId: "aiko-pngtuber";
  rendererKind: "pngtuber";
  expressionId: AikoEmotionId;
  motionState: "idle" | "thinking" | "talking";
  drivenBy: "manual" | "chat-bridge";
};
```

Keep this as app-level or feature-level state and pass it into renderer-specific components as props. The provider must be mounted above both `ChatPage` and `PngTuberPage`; otherwise chat events cannot update the avatar while the PNGTuber page is closed. Future Live2D support should add a separate renderer module while sharing the semantic runtime state.

## Implementation Plan

Build this in small steps. The goal is to make PNGTuber react to chat now without locking the chat system to PNG files or blocking future Live2D support.

### 1. Add Avatar Runtime Core

Status: implemented.

Create a small runtime layer under `apps/web/src/features/avatar/runtime/`.

Recommended files:

```text
apps/web/src/features/avatar/runtime/
  avatarRuntimeTypes.ts
  avatarRuntimeStore.ts
```

The runtime type should describe semantic avatar state, not renderer internals:

```ts
type AvatarRendererKind = "pngtuber" | "live2d";
type AvatarMotionState = "idle" | "thinking" | "talking";
type AvatarDrivenBy = "manual" | "chat-bridge";

type AvatarRuntimeState = {
  avatarId: string;
  rendererKind: AvatarRendererKind;
  expressionId: string;
  motionState: AvatarMotionState;
  drivenBy: AvatarDrivenBy;
};
```

Start with a lightweight React store or context. Do not add a larger state library unless multiple app-level stores start needing the same pattern.

Mount the provider at the app boundary:

```text
apps/web/src/app/App.tsx
  -> AvatarRuntimeProvider
     -> Routes
```

Do not put the provider inside `PngTuberPage`, because the chat bridge and future chat overlay must keep working when the user is on `/chat`.

This step is done when:

- `PngTuberPage` can read and update avatar state through the runtime store.
- Manual controls still work.
- The runtime state has no PNG asset URL, CSS class name, or Live2D file name.
- Leaving `/avatar/pngtuber` does not reset the runtime state unless the app reloads.

### 2. Split The PNGTuber Renderer

Status: implemented.

Move the image rendering and animation class selection out of `PngTuberPage` into a renderer component.

Recommended files:

```text
apps/web/src/features/avatar/renderers/pngtuber/
  PngTuberRenderer.tsx
```

`PngTuberRenderer` should receive resolved renderer props and only render the visual performer:

```tsx
<PngTuberRenderer
  emotion={activeEmotion}
  motionState={runtime.motionState}
/>
```

Keep `PngTuberPage` responsible for studio layout, sidebars, controls, and inspector UI.

This step is done when:

- The same renderer can be mounted by `PngTuberPage` and later by `ChatPage`.
- `PngTuberPage` no longer owns the raw `<img>` rendering details.
- CSS animation names remain renderer-specific.

### 3. Add Chat-To-Avatar Bridge

Status: implemented.

Create a bridge that translates chat lifecycle events into avatar runtime changes. Chat should emit semantic events; it should not select PNG assets.

Recommended files:

```text
apps/web/src/features/avatar/runtime/
  avatarChatBridge.ts
```

The current implementation wires this at the page boundary:

```text
ChatPage
  -> useAvatarChatBridge()
  -> useChatSession({ onAvatarChatEvent })
```

This keeps `useChatSession` independent of PNGTuber assets and renderer details. The chat hook only emits lifecycle-shaped events through the callback it receives.

Recommended event shape:

```ts
type ChatAvatarEvent =
  | { type: "assistant_waiting"; chatId: string | null; personaId: string }
  | { type: "assistant_replied"; chatId: string; personaId: string; text: string }
  | { type: "assistant_error"; chatId: string | null; personaId: string };
```

`chatId` is nullable for waiting/error events because a new draft chat may not have a persisted chat id until `createPersonaChat()` succeeds.

Keep avatar binding separate from chat session state:

```ts
type AvatarBinding = {
  personaId: string;
  avatarId: string;
  enabled: boolean;
};
```

Initial binding can be hardcoded to Aiko only:

```text
personaId "aiko" -> avatarId "aiko-pngtuber"
```

If an event has no enabled binding, the bridge should no-op. This keeps chat and avatar separate and prevents future Live2D/model pages from becoming coupled to chat personas.

Current mapping:

```text
assistant_waiting -> neutral + thinking
assistant_replied -> inferred expression + talking, then idle
assistant_error   -> sad + idle
```

Expression detection is currently a tiny conservative keyword heuristic inside `avatarChatBridge.ts`. It maps only to the known semantic expressions (`neutral`, `happy`, `shy`, `sad`, `surprised`) and defaults to `neutral` when no rule matches. Do not parse UI text inside `PngTuberPage`.

The bridge uses a short timeout to return from `talking` to `idle` in the request/response phase. Store and clear that timeout inside the bridge/runtime layer so rapid messages do not leave stale timers that override newer avatar state.

This step is done when:

- `useChatSession.sendMessage()` can notify the bridge before send, after reply, and on error.
- Chat code does not import PNG asset metadata.
- Avatar state updates happen even if the PNGTuber page is not currently open.
- Rapid send/error/retry flows do not leave the avatar stuck in `talking` or `thinking`.

### 4. Mount A Chat Overlay

Status: implemented.

After the bridge exists, add a small optional PNGTuber overlay to `ChatPage` using the same runtime state and renderer.

Recommended location:

```text
apps/web/src/features/avatar/components/
  AvatarOverlay.tsx
```

The overlay should be a consumer of avatar runtime state. It should not own chat state and should not call the chat API.

The current overlay is mounted by `ChatPage`, uses `PngTuberRenderer`, and is hidden on small screens to avoid covering mobile chat controls. It displays compact motion labels from `pngtuber.stateShort.*`.

Overlay visibility, position, and size are controlled from the app settings dialog. These preferences are persisted locally with `wfchat.avatarOverlayVisible`, `wfchat.avatarOverlayPosition`, and `wfchat.avatarOverlaySize` so users can tune the chat page performer without disabling the runtime bridge or changing PNGTuber Studio behavior.

This step is done when:

- Sending a chat message changes the overlay to thinking.
- Receiving a reply makes the overlay talk briefly.
- The overlay returns to idle without blocking the chat composer.
- The overlay can be hidden or removed without changing chat behavior.

### 5. Prepare Live2D Without Implementing It Yet

Status: implemented as a route/page shell.

Only reserve the renderer boundary for Live2D in the shared types:

```text
rendererKind: "pngtuber" | "live2d"
```

`/model/live2d` is a separate workspace shell from `/avatar/pngtuber`. It reserves the product surface for future rigged 2D models without importing a Live2D runtime or coupling chat to Live2D-specific files.

Do not add Live2D model loading, physics, motion priority, or lip-sync parameters until real Live2D assets and runtime decisions exist. Those details should live under a future `renderers/live2d/` module.

This step is done when:

- PNGTuber still works as the only implemented renderer.
- No chat code depends on PNGTuber-specific names.
- Adding `Live2DRenderer` later would not require changing chat event flow.

## Transport Decision

Do not start with WebSocket for this work. The current chat flow is request/response, so the first bridge can run entirely in the frontend from existing `sendMessage()` lifecycle points.

Preferred order:

```text
runtime store -> renderer split -> chat bridge -> chat overlay -> SSE/token streaming -> WebSocket if needed
```

Use SSE before WebSocket if the next need is one-way AI response streaming. Reserve WebSocket for truly bidirectional realtime features such as voice input, live mic volume, remote overlay control, OBS control, or multi-device avatar synchronization.

## Asset Guidelines

- Prefer transparent PNG or WebP cutouts.
- Keep all expressions in the same general crop and character scale.
- Use one file per expression until the app needs sprite-sheet performance.
- Do not overwrite existing generated assets; add a new filename and update `aikoPngTuber.ts`.
- If creating Live2D later, keep this PNGTuber metadata as the fallback renderer contract.
