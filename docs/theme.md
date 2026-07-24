# Theme

`apps/web/src/styles.css` is authoritative for Tailwind mappings, light/dark
values, shared control classes, scrollbar styling, and synchronized background
surfaces. Components use semantic tokens, not raw colors.

## Surface Systems

- `app-*`: translucent persistent chrome and content surfaces that may reveal
  the user's background image.
- `dialog-*`: solid controls and modal surfaces such as confirms and alerts.
- `action-*`: theme-adaptive command controls.

| Intent               | Typical utility                        |
| -------------------- | -------------------------------------- |
| App base             | `bg-app-bg`                            |
| Large shell          | `bg-app-panel/62 border-app-border`    |
| Popover/menu         | `bg-app-panel/82`                      |
| Floating control     | `bg-app-panel/92`                      |
| Nested field/control | `bg-app-soft` or `bg-app-soft/82`      |
| Primary surface      | `bg-primary text-primary-text`         |
| Primary text         | `text-app-text`                        |
| Secondary text       | `text-muted`                           |
| Dialog shell         | `bg-dialog-panel border-dialog-border` |
| Dialog field/control | `bg-dialog-soft border-dialog-border`  |

Use `Button` for text-bearing buttons and `IconButton` for icon-only controls.
Their variants own color, border, hover, focus, disabled, destructive, and
dark-mode behavior. Feature `className` values should normally control layout
only.

## Background Image Surfaces

`AppLayout` renders the wallpaper behind the app and provides
`--wfchat-bg-*` values. Ordinary translucent components use `bg-app-*`
directly.

Use `app-surface-panel`, `app-surface-soft`, or `app-surface-shell` only
when a rail or shell must show the same wallpaper coordinates without revealing
a sibling moving behind it. Settings/profile drawers use
`app-surface-shell` with `dialog-*` controls inside. Surfaces outside
`AppLayout` must receive the current background URL before using these
classes. Use the `mobile-*` variants when synchronization is needed only below
`lg`.

Do not add backdrop blur as a readability fix. Adjust semantic surface opacity
instead. Do not use synchronized surfaces for repeated message rows.

## Scrollbars

App-owned scroll regions use `chat-scroll` with `overflow-y-auto` or
`overflow-auto`. Despite its name, it is the shared themed scrollbar utility.
Do not add feature-specific scrollbar colors when it applies.

## Rules

- Use `app-*` for persistent page chrome and `dialog-*` for contained modal
  surfaces and controls.
- Keep nested controls and user message bubbles more opaque than their shell.
- Pair `bg-primary` with `text-primary-text`; the foreground adapts to the
  light or dark primary surface.
- Separate surfaces with color and borders. Do not add box shadows, inset
  shadows, text shadows, or drop shadows. Focus and status rings remain allowed;
  they communicate interaction or state rather than visual depth.
- Do not hard-code hex/RGB values or use raw `bg-white`, `bg-slate-*`, or
  `bg-zinc-*` for application surfaces.
- Check light/dark themes, wallpaper on/off, hover/focus, and mobile overlays
  after visual changes.
- Add a token only for a repeated semantic role. Define its Tailwind mapping and
  both theme values in `styles.css`, then document its intent here.
