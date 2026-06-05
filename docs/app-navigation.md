# App Navigation

The web app uses a small app-level navigation rail before the feature sidebar.

```text
ActivityBar -> page sidebar -> page header/content/details
```

## Current Pages

- `chat`: the main chat workspace.
- `model3d`: a mock 3D model workspace used as a placeholder for future model tooling.

`apps/web/src/app/App.tsx` owns the current `activePage` state. The project does not use a router library yet; chat deep links such as `/chat/:id` are still handled inside the chat feature.

## Layout Contract

`apps/web/src/layouts/AppLayout.tsx` owns the shared shell:

- `activityBar`: app-level page navigation.
- `sidebar`: page-specific navigation or asset list.
- `header`: page-specific top bar.
- `children`: primary page content.
- `details`: optional right-side inspector/details area.

Keep page-specific state inside the page or feature boundary. The activity bar should only select app pages and should not own chat, model, or inspector state.

## Styling

Use existing theme tokens such as `app-*`, `dialog-*`, `primary`, and `muted`. Do not add gradient backgrounds for app navigation or page mockups; use flat surfaces, borders, and existing opacity tokens instead.
