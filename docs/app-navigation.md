# App Navigation

The web app uses a small app-level navigation rail before the feature sidebar.

```text
ActivityBar -> page sidebar -> page header/content/details
```

## Current Pages

- `chat`: the main chat workspace.
- `pngtuber`: the PNGTuber workspace used for the current PNG-based visual performer.

`apps/web/src/app/App.tsx` owns the top-level route map through `react-router-dom`:

- `/` redirects to `/chat`.
- `/chat` opens the chat workspace without an active chat.
- `/chat/:chatId` opens the chat workspace and lets the chat feature load the active chat.
- `/avatar` redirects to `/avatar/pngtuber` while the generic avatar hub is not built yet.
- `/avatar/pngtuber` opens the PNGTuber workspace.
- `/model3d` redirects to `/avatar/pngtuber` for compatibility with older local links.

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

The PNGTuber page intentionally renders the delete/trash action disabled in the same position as chat clear/delete. It is a positional marker only and must not mutate avatar or chat data.

## Styling

Use existing theme tokens such as `app-*`, `dialog-*`, `primary`, and `muted`. Do not add gradient backgrounds for app navigation or page mockups; use flat surfaces, borders, and existing opacity tokens instead.
