# App Navigation

The web app uses a small app-level navigation rail before the feature sidebar.

```text
ActivityBar -> page sidebar -> page header/content/details
```

## Current Pages

- `chat`: the main chat workspace.
- `cafe`: the guest-first Aiko Cafe lobby and joinable top-down rooms.
- `pngtuber`: the PNGTuber workspace used for the current PNG-based visual performer.
- `model2d`: the reserved Live2D workspace shell for future rigged 2D models.

`apps/web/src/app/App.tsx` owns the top-level route map through `react-router-dom`:

- `/` redirects to `/chat`.
- `/chat` opens the chat workspace without an active chat.
- `/chat/:chatId` opens the chat workspace and lets the chat feature load the active chat. `:chatId` must be a UUID; invalid chat path segments are treated as draft chat paths and must not call the backend chat detail endpoint.
- `/cafe` opens the Cafe lobby. It does not require login.
- `/cafe/rooms/:roomId` opens a Cafe room. `:roomId` must be a UUID; invalid
  values return to the lobby without opening a WebSocket.
- `/avatar` redirects to `/avatar/pngtuber` while the generic avatar hub is not built yet.
- `/avatar/pngtuber` opens the PNGTuber workspace.
- `/model` redirects to `/model/live2d` while the generic model hub is not built yet.
- `/model/live2d` opens the reserved Live2D workspace shell.
- `/model3d` redirects to `/model/live2d` for compatibility with older local links.

The activity bar uses route links instead of page state, so the URL is the source of truth for reload, back, and forward navigation.

## Layout Contract

`apps/web/src/layouts/AppLayout.tsx` owns the shared shell:

- `activityBar`: app-level page navigation.
- `sidebar`: page-specific navigation or asset list.
- `header`: page-specific top bar.
- `children`: primary page content.
- `details`: optional right-side inspector/details area.

Keep page-specific state inside the page or feature boundary. The activity bar should only link to app routes and should not own chat, PNGTuber, model, or inspector state.

## Header Contract

App pages should keep shared header action positions stable where practical. Some users remember controls by spatial position, so pages can render disabled placeholder actions to mark the same station even when that page does not support the action yet.

Shared app headers use one clear title line. Do not add descriptive subtitle
labels or decorative icons beside the title. A compact title accessory is
reserved for functional state that users need while working, such as chat
presence or Cafe connection status. Page identity icons may remain in the
leading slot, and action controls remain on the right.

The PNGTuber and Live2D shell pages intentionally render the delete/trash action disabled in the same position as chat clear/delete. It is a positional marker only and must not mutate avatar, model, or chat data.

## Styling

Use existing theme tokens such as `app-*`, `dialog-*`, `primary`, and `muted`. Do not add gradient backgrounds for app navigation or page mockups; use flat surfaces, borders, and existing opacity tokens instead.
