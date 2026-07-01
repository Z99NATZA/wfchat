# Components

## Shared UI

Shared UI lives in `apps/web/src/components/ui`.

Current shared components:

- `Button`: shared non-icon command button styling for ordinary app and dialog actions.
- `IconButton`: shared icon-only button styling, sizing, visual variants, disabled state, and accessibility defaults.
- `StatusDot`: small presence indicator used by chat headers.

Dialog primitives live in `apps/web/src/components/dialog`.

- `DialogProvider`: app-level dialog state host and API.
- `Dialog`: base modal shell (overlay, focus/escape close, draggable header, actions slot).
- `ConfirmDialog`: reusable confirm modal built on top of `Dialog`.

Use `useDialog()` from `DialogProvider` for consistent app-wide behavior:

- `confirm(options)`: yes/no confirmation.
- `alert(options)`: one-button information modal.
- `openCustom(options)`: custom content modal using a render callback.
  `openCustom` supports `size: "wide"` for larger content and
  `showCancelAction: false` for single-action preview-style dialogs.

Shared components should be generic. Do not place chat-specific text, fixtures, or business behavior in this folder.

Use `Button` for every non-icon button that contains visible text, with or without a leading icon. Pick the smallest variant and size that matches the command intent:

```tsx
<Button variant="primary" size="lg">Save</Button>
<Button variant="secondary" surface="dialog">Cancel</Button>
<Button variant="destructive">Delete</Button>
<Button variant="ghostDestructive" size="menu" align="start" fullWidth>Delete chat</Button>
```

Menu items, row selectors, segmented options, and switch rows should still use `Button` when they are implemented as text buttons. Use `variant`, `size`, `align`, `surface`, and `fullWidth` rather than one-off padding, border, hover, or dark-mode class strings.

Use `IconButton` for every icon-only control. Pick variants and sizes instead of adding one-off color, border, hover, focus, or disabled classes:

```tsx
<IconButton aria-label="Settings"><Settings size={18} /></IconButton>
<IconButton variant="danger" aria-label="Delete"><Trash2 size={18} /></IconButton>
<IconButton variant="ghost" size="xs" aria-label="More"><Ellipsis size={14} /></IconButton>
```

`IconButton` `className` should be limited to layout or visibility concerns such as `hidden`, `lg:hidden`, `absolute`, or `shrink-0`.

## Feature Components

Chat feature components live in `apps/web/src/features/chat/components`.

- `ChatSidebar`: companion list, search field, and mobile sidebar close action.
- `ChatHeader`: active companion identity and global chat actions.
- `ChatMessageList`: message timeline rendering.
- `ChatMessageContent`: user plain-text rendering and assistant Markdown rendering inside message bubbles.
- `ChatComposer`: draft input, quick prompt chips that fill the draft without auto-send, and send action.
- `ChatDetailsPanel`: companion profile, memory, response metrics, and safety controls.

Chat message content rendering has its own scope document: `docs/chat-message-rendering.md`. Read it before adding Markdown, code blocks, tables, message actions, or other rich response surfaces.

## Component Boundaries

Keep components focused on rendering and UI events. Move non-trivial state logic into hooks and move domain decisions into services.

Before adding visual surfaces, read `docs/theme.md`. The app has separate color systems for translucent app chrome (`app-*`) and solid modal dialogs (`dialog-*`), and new components should use the correct layer instead of raw colors.

Prefer props that describe intent:

```tsx
<ChatComposer onSend={sendMessage} onDraftChange={setDraft} />
```

Avoid passing large unrelated objects when a component only needs a few fields.
