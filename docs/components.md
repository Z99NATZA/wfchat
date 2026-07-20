# Components

Reusable frontend UI lives in `apps/web/src/components/`; feature-specific UI
stays under `apps/web/src/features/<feature>/components/`.

## Shared UI

- `Button`: all text-bearing buttons, including menu and row actions.
- `IconButton`: icon-only controls with shared size, variant, focus, disabled,
  and accessibility behavior.
- `StatusDot`: compact presence state.
- `DialogProvider` and `Dialog`: modal host and shell.
- `ConfirmDialog`: shared confirmation UI.

`useDialog()` exposes `confirm`, `alert`, and `openCustom`. Custom dialogs
can use the wide size and hide the cancel action. Dragging is enabled only on
desktop-like fine-pointer viewports.

Choose `Button`/`IconButton` variants and sizes instead of repeating padding,
border, hover, focus, danger, or dark-mode classes. Their `className` should
normally contain layout or responsive visibility only.

Settings includes a single confirmed learned-context reset action. It does not
show a memory list or per-item controls.

## Chat Components

- `ChatSidebar`: persona chats, search, selection, and deletion.
- `ChatHeader`: active persona and chat actions.
- `ChatMessageList`: virtualized timeline and scroll state.
- `ChatMessageContent`: user plain text/images and assistant Markdown.
- `ChatComposer`: text, quick prompts, images, microphone, and send state.
- `ChatDetailsPanel`: persona profile, tone, and conversation guidance.

## Boundaries

- Components render state and emit UI events.
- Hooks own non-trivial lifecycle and interaction state.
- Services own API/transport behavior.
- Backend/store code owns business rules and authorization.
- Shared components contain no chat fixtures, provider details, or domain
  decisions.

Before adding UI, follow [Theme](theme.md), [Frontend architecture](frontend-architecture.md),
and the relevant feature document.
