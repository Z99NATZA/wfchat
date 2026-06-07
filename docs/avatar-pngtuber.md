# Aiko PNGTuber Avatar

The avatar workspace supports a first PNGTuber implementation for Aiko. This is the lightweight 2D path before Live2D rigging.

## Runtime Files

- UI page: `apps/web/src/pages/AvatarPage.tsx`
- Avatar metadata: `apps/web/src/features/avatar/data/aikoPngTuber.ts`
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

The page currently keeps avatar state locally:

```text
activeEmotionId: neutral | happy | shy | sad | surprised
isTalking: boolean
```

The stage renders the selected PNG and applies one of two CSS animation loops:

- idle: slow breathing motion
- talking: slightly faster bob motion

The `AI state bridge` asset shown in the sidebar is a marker only. It reserves the product location for later chat-driven state without coupling the avatar page to chat transport yet.

## Future Chat Bridge

When connecting the avatar to character AI, keep the state bridge small:

```text
chat request starts        -> neutral + idle
AI is generating           -> neutral + idle or thinking
AI response streaming      -> selected emotion + talking
AI response complete       -> selected emotion + idle
```

Emotion selection should be derived from message metadata or a small classifier result, not from raw UI text parsing inside `AvatarPage`.

Recommended future metadata:

```ts
type AvatarRuntimeState = {
  characterId: "aiko";
  emotionId: AikoEmotionId;
  isTalking: boolean;
};
```

Keep this as app-level or feature-level state and pass it into the avatar renderer as props.

## Asset Guidelines

- Prefer transparent PNG or WebP cutouts.
- Keep all expressions in the same general crop and character scale.
- Use one file per expression until the app needs sprite-sheet performance.
- Do not overwrite existing generated assets; add a new filename and update `aikoPngTuber.ts`.
- If creating Live2D later, keep this PNGTuber metadata as the fallback renderer contract.
