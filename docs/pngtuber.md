# Aiko PNGTuber

The PNGTuber renderer is Aiko's active avatar implementation. The Live2D route
is a UI shell and loads no model or runtime.

## Assets And Runtime

`AvatarRuntimeProvider` is mounted above routes and stores semantic state:

```ts
type AvatarRuntimeState = {
  avatarId: string;
  rendererKind: "pngtuber" | "live2d";
  expressionId: string;
  motionState: "idle" | "thinking" | "talking";
  drivenBy: "manual" | "chat-bridge";
};
```

Renderer-neutral state must not contain PNG URLs, CSS classes, model paths, or
physics parameters.

Aiko expressions are `neutral`, `happy`, `shy`, `sad`, and `surprised`
under `apps/web/public/images/aiko-pngtuber/`. Keep the crop and character scale
consistent. Add a new filename when replacing an asset because nginx caches
these paths as immutable.

`scheduleAikoPngTuberAssetPreload()` requests neutral first and the remaining
expressions during browser idle time. It is non-blocking and deduplicates URLs
for the current session.

## Ownership

| File | Role |
| --- | --- |
| `pages/PngTuberPage.tsx` | Studio layout and manual controls |
| `features/avatar/data/aikoPngTuber.ts` | Expression assets and metadata |
| `features/avatar/runtime/avatarRuntimeStore.tsx` | Shared semantic state |
| `features/avatar/runtime/avatarBindings.ts` | Persona-to-avatar binding |
| `features/avatar/runtime/avatarChatBridge.ts` | Chat/speech event mapping |
| `features/avatar/runtime/avatarEmotionInference.ts` | Conservative text heuristic |
| `features/avatar/renderers/pngtuber/PngTuberRenderer.tsx` | PNG rendering and CSS motion |
| `features/avatar/components/AvatarOverlay.tsx` | Chat overlay |

The current binding is:

```text
aiko -> aiko-pngtuber -> pngtuber
```

## Chat And Speech Behavior

```text
assistant_waiting   -> neutral + thinking
assistant_streaming -> neutral + talking
assistant_replied   -> inferred expression + talking, then idle
assistant_error     -> sad + idle

speech loading      -> current/inferred expression + thinking
speech playing      -> inferred expression + talking
speech stop/end     -> current expression + idle
speech error        -> sad/current expression + idle
```

Emotion inference maps a small keyword set only to known expressions and
defaults to neutral. Chat emits semantic events and never imports PNG metadata
or renderer components.

Speech motion follows playback lifecycle only. There is no waveform, amplitude,
phoneme, viseme, mouth-shape, or lip-sync analysis.

## Rendering And Overlay

`PngTuberRenderer` receives resolved expression and motion. Expression
fade/scale runs on a wrapper while idle/thinking/talking loops run on the image,
so transforms do not overwrite each other. Reduced-motion preferences disable
unnecessary animation.

The Studio's top control strip remains above the non-interactive stage on small
screens. Manual expression/motion controls update the same shared runtime used
by chat.

Chat overlay visibility, position, and size are local settings:

```text
wfchat.avatarOverlayVisible
wfchat.avatarOverlayPosition
wfchat.avatarOverlaySize
```

The bridge keeps updating when the overlay is hidden. On mobile, `ChatPage`
positions the overlay above the measured composer and reserves only the measured
overlay height plus a gap in the timeline.

## Current Limits

- Aiko is the only bound persona.
- Users cannot upload or manage PNG sets.
- The Live2D shell has no model loading, physics, motions, or lip sync.
- Avatar runtime is local to the mounted app; it is not remotely controlled or
  synchronized across devices.
