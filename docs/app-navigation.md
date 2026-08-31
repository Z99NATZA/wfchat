# App Navigation

The web app uses a small app-level navigation rail before the feature sidebar.

```text
ActivityBar -> page sidebar -> page header/content/details
```

## Current Pages

- `chat`: the main chat workspace.
- `cafe`: the guest-first Aiko World lobby with joinable Aiko Cafe and
  Greenwood Retreat rooms.
- `pngtuber`: the PNGTuber workspace used for the current PNG-based visual performer.
- `model2d`: a Live2D workspace shell with no model runtime.

`apps/web/src/app/AppRouter.tsx` owns the public route boundary. `/privacy`
renders the localized whole-product Privacy Policy without loading
`App.tsx`, creating or resolving a session, or initializing Google Login. All
other paths lazy-load `App.tsx`, which owns the interactive route map through
`react-router-dom`:

- `/` redirects to `/chat`.
- `/chat` opens the chat workspace without an active chat.
- `/chat/:chatId` opens the chat workspace and lets the chat feature load the active chat. `:chatId` must be a UUID; invalid chat path segments are treated as draft chat paths and must not call the backend chat detail endpoint.
- `/cafe` opens the Aiko World lobby. It does not require login.
- `/cafe/rooms/:roomId` opens an Aiko World room. `:roomId` must be a UUID; invalid
  values return to the lobby without opening a WebSocket.
- `/avatar` redirects to `/avatar/pngtuber`.
- `/avatar/pngtuber` opens the PNGTuber workspace.
- `/model` redirects to `/model/live2d`.
- `/model/live2d` opens the Live2D workspace shell.
- `/model3d` redirects to `/model/live2d`.

The Guest Profile sheet places a same-tab `/privacy` link with the Google Login
UI. The authenticated Profile sheet repeats the same link at the bottom, after
account management, so the policy remains available after login. The policy
includes the public contact address `z99natza@gmail.com`, a Thai/English
selector, and a back link to `/chat`.

The activity bar uses route links instead of page state, so the URL is the source of truth for reload, back, and forward navigation.

The authenticated Profile sheet ends with a separate destructive account
management card after the Account card. Account deletion uses one destructive
confirmation dialog, closes the sheet after success, resets Chat to a draft,
and returns the browser to Guest state. Theme, font, and locale stay as
device-level preferences; account-derived chat/sync caches and the synced
background image are cleared.

## Layout Contract

`apps/web/src/layouts/AppLayout.tsx` owns the shared shell:

- `activityBar`: app-level page navigation.
- `sidebar`: page-specific navigation or asset list.
- `header`: page-specific top bar.
- `children`: primary page content.
- `details`: optional right-side inspector/details area.

Keep page-specific state inside the page or feature boundary. The activity bar should only link to app routes and should not own chat, PNGTuber, model, or inspector state.

## Header Contract

App pages render only header actions that are supported on that page. Do not add
disabled positional placeholders for unavailable actions.

Shared app headers use one clear title line. Do not add descriptive subtitle
labels or decorative icons beside the title. A compact title accessory is
reserved for functional state that users need while working, such as chat
presence or Cafe connection status. Page identity icons may remain in the
leading slot, and action controls remain on the right.

## Styling

Use existing theme tokens such as `app-*`, `dialog-*`, `primary`, and `muted`. Do not add gradient backgrounds for app navigation or page mockups; use flat surfaces, borders, and existing opacity tokens instead.
