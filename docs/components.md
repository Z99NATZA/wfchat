# Components

## Shared UI

Shared UI lives in `src/components/ui`.

Current shared components:

- `IconButton`: consistent icon-only button styling and accessibility defaults.
- `StatusDot`: small presence indicator used by chat headers.

Shared components should be generic. Do not place chat-specific text, fixtures, or business behavior in this folder.

## Feature Components

Chat feature components live in `src/features/chat/components`.

- `ChatSidebar`: companion list, search field, and mobile sidebar close action.
- `ChatHeader`: active companion identity and global chat actions.
- `ChatMessageList`: message timeline rendering.
- `ChatComposer`: draft input, quick prompts, and send action.
- `ChatDetailsPanel`: companion profile, memory, response metrics, and safety controls.

## Component Boundaries

Keep components focused on rendering and UI events. Move non-trivial state logic into hooks and move domain decisions into services.

Prefer props that describe intent:

```tsx
<ChatComposer onSend={sendMessage} onDraftChange={setDraft} />
```

Avoid passing large unrelated objects when a component only needs a few fields.
