# Aiko PNGTuber

The PNGTuber workspace supports the first lightweight visual implementation for Aiko before Live2D rigging is available.

## Runtime Files

- UI page: `apps/web/src/pages/PngTuberPage.tsx`
- PNGTuber metadata: `apps/web/src/features/avatar/data/aikoPngTuber.ts`
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

The page currently keeps PNGTuber state locally:

```text
activeEmotionId: neutral | happy | shy | sad | surprised
isTalking: boolean
```

The stage renders the selected PNG and applies one of two CSS animation loops:

- idle: slow breathing motion
- talking: slightly faster bob motion

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
};
```

Keep this as app-level or feature-level state and pass it into renderer-specific components as props. Future Live2D support should add a separate renderer module while sharing the semantic runtime state.

## Asset Guidelines

- Prefer transparent PNG or WebP cutouts.
- Keep all expressions in the same general crop and character scale.
- Use one file per expression until the app needs sprite-sheet performance.
- Do not overwrite existing generated assets; add a new filename and update `aikoPngTuber.ts`.
- If creating Live2D later, keep this PNGTuber metadata as the fallback renderer contract.
