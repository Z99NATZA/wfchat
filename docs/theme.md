# Theme And Color Guidelines

This project uses semantic CSS variables exposed through Tailwind CSS v4. New UI should use the semantic tokens in `apps/web/src/styles.css` instead of hard-coded color values.

The current design supports a full-screen user background image. Because of that, the app has two different surface systems:

- `app-*`: translucent app chrome and chat surfaces that may reveal the background image.
- `dialog-*`: solid modal surfaces that should not reveal the background image.

## Source Files

- `apps/web/src/styles.css`: Tailwind import, color tokens, shared component classes, and theme values.
- `apps/web/src/layouts/AppLayout.tsx`: full-screen app shell and background image layer.
- `apps/web/src/stores/backgroundStore.ts`: persisted background image URL.
- `apps/web/src/hooks/useTheme.ts`: React-facing theme API.
- `apps/web/src/stores/themeStore.ts`: theme persistence and document class application.

## Theme Model

Tailwind utilities map to CSS variables:

```css
@theme {
	--color-app-panel: var(--app-panel);
	--color-dialog-panel: var(--dialog-panel);
}
```

Light theme values live in `:root`. Dark theme overrides live in `.dark`.

```css
:root {
	--app-panel: rgb(255 255 255 / 0.82);
}

.dark {
	--app-panel: rgb(59 65 77 / 0.88);
}
```

Dark mode uses a class selector:

```css
@custom-variant dark (&:where(.dark, .dark *));
```

The active theme is applied to `document.documentElement`, so components should keep Tailwind class names stable and let CSS variables change the actual colors.

## Token Reference

Use these tokens by intent, not by visual similarity.

| Token | Tailwind class | Purpose |
| --- | --- | --- |
| `--app-bg` | `bg-app-bg` | Base app background behind all UI. |
| `--app-panel` | `bg-app-panel` | Main app chrome surface. Translucent by design. |
| `--app-soft` | `bg-app-soft` | Nested app controls, fields, chips, secondary panels. Translucent by design. |
| `--app-text` | `text-app-text` | Primary readable text. |
| `--app-border` | `border-app-border` | App chrome and surface borders. |
| `--dialog-panel` | `bg-dialog-panel` | Modal/drawer/dialog shell. Solid by design. |
| `--dialog-soft` | `bg-dialog-soft` | Nested controls inside modals/drawers/dialogs. Solid by design. |
| `--dialog-border` | `border-dialog-border` | Modal/drawer/dialog borders. |
| `--brand-primary` | `bg-primary`, `text-primary`, `border-primary` | Brand and primary action color. |
| `--brand-primary-hover` | `bg-primary-600` | Primary action hover background. |
| `--action-*` | `bg-action`, `text-action-text`, `border-action-border` | High-contrast action button token set. |
| `--muted` | `text-muted` | Secondary text, metadata, less prominent icons. |
| `--app-bg-image-opacity` | inline style var | Full-screen background image opacity. |
| `--wfchat-bg-image` | inline style var | Shared background image used by local app surfaces. |

## Current Values

Light mode:

```css
--app-bg: #f6f8fc;
--app-panel: rgb(255 255 255 / 0.82);
--app-soft: rgb(240 244 251 / 0.66);
--app-border: rgb(220 227 239 / 0.52);
--dialog-panel: #ffffff;
--dialog-soft: #f0f4fb;
--dialog-border: #dce3ef;
--app-bg-image-opacity: 0.18;
```

Dark mode:

```css
--app-bg: #282c33;
--app-panel: rgb(59 65 77 / 0.88);
--app-soft: rgb(47 52 62 / 0.72);
--app-border: rgb(116 126 143 / 0.38);
--dialog-panel: #3b414d;
--dialog-soft: #2f343e;
--dialog-border: #4a5260;
--app-bg-image-opacity: 0.1;
```

## Background Image Rules

The user background image is rendered by `AppLayout` as a separate absolute layer behind the UI.

It should remain subtle. The intended behavior is close to VS Code wallpaper extensions:

- Dark mode uses lower background visibility because dark UI needs stronger separation.
- Light mode uses slightly higher background visibility because light surfaces wash out the image more.
- Components should not rely on blur for readability.
- Dialogs, modals, drawers, fixed rails, and surfaces that have sliding panels behind or content behind them may use `app-surface-panel` or `app-surface-soft`.
- Use `mobile-app-surface-panel` when the no-bleed behavior is needed only below the `lg` breakpoint.
- Use `app-surface-shell` for a dialog or drawer shell that should show the wallpaper at the same lighter shell opacity as ordinary app sidebars.
- Dialog/drawer surfaces outside `AppLayout`, such as profile drawers, must receive the current background image URL and set the `--wfchat-bg-*` variables locally before using a synced surface class.
- `AppLayout` calculates the viewport-cover wallpaper size and syncs each app surface's background position from its viewport rectangle. This makes every surface show the same wallpaper coordinates while its opaque local base prevents sibling components from bleeding through.
- Normal layout chrome, absolute controls, message bubbles, and ordinary cards should use the regular translucent `bg-app-*` tokens. They do not need per-frame background position syncing.

Do not add `backdrop-blur` for normal app surfaces unless the design is intentionally changed again. Blur was removed because it made the visual model harder to tune.

## Surface Hierarchy

Use this hierarchy when adding components.

### Level 0: Base App Area

Use no extra surface when content can sit directly in the chat content area.

Examples:

- Message timeline spacing containers.
- Empty layout wrappers.
- Non-interactive page layout areas.

Recommended classes:

```tsx
<div className="min-h-0 flex-1">
	{children}
</div>
```

### Level 1: Main App Shell

Use this for large persistent UI regions that should let the background image show through without special no-bleed behavior.

Examples:

- Sidebar shell.
- Header shell.
- Bottom composer shell.
- Right details panel shell.

Recommended classes:

```tsx
<aside className="border-r border-app-border bg-app-panel/62">
	...
</aside>
```

`bg-app-panel/62` is the preferred large-shell opacity for normal layout chrome. Use `app-surface-panel` only when the surface must prevent underlying components from showing through, such as an activity rail above a sliding sidebar. Use `mobile-app-surface-panel` for mobile sidebars and dropdown menus that overlay chat content.

### Level 2: Nested App Components

Use this for controls and contained UI inside main shell regions. These must stay more readable than the shell.

Examples:

- Search fields.
- Select controls.
- Icon buttons.
- Memory cards.
- Composer input body.

Recommended classes:

```tsx
<div className="rounded-lg border border-app-border bg-app-soft">
	...
</div>
```

For nested elements inside very translucent shells, prefer a stronger local opacity:

```tsx
<form className="rounded-lg border border-app-border bg-app-soft/82">
	...
</form>
```

### Level 3: Chat Content Cards

Chat bubbles and floating chat controls need stronger readability because they sit directly over the content area.

Examples:

- AI message bubble.
- Thinking bubble.
- Empty-state card inside message list.
- Jump-to-latest button.

Recommended classes:

```tsx
<div className="rounded-lg border border-app-border bg-app-panel/92 text-app-text shadow-soft">
	...
</div>
```

User bubbles use primary color and should stay distinct:

```tsx
<div className="rounded-lg bg-primary text-white">
	...
</div>
```

### Level 4: Modal And Drawer Dialogs

Dialogs should not use translucent app surfaces. They should be solid and visually independent from the background image and app chrome behind them.

Examples:

- Profile drawer.
- Settings drawer.
- Confirm dialog.
- Alert dialog.
- Custom dialogs opened through `useDialog()`.

Use `dialog-*` tokens:

```tsx
<aside className="border border-dialog-border bg-dialog-panel">
	<section className="border border-dialog-border bg-dialog-soft">
		...
	</section>
</aside>
```

Do not use `bg-app-panel/62`, `bg-app-panel/82`, or `bg-app-soft/82` inside modal/dialog shells unless the component is intentionally part of the page chrome rather than a modal.

## Practical Recipes

### Persistent Sidebar

```tsx
<aside className="border-r border-app-border bg-app-panel/62">
	<div className="border-b border-app-border">...</div>
	<input className="border border-app-border bg-app-soft text-app-text" />
</aside>
```

### Header Toolbar Control

```tsx
<label className="inline-flex items-center rounded-lg border border-app-border bg-app-soft text-app-text">
	<select className="bg-transparent text-app-text outline-none" />
</label>
```

For header and app-toolbar controls that use `hover:border-primary` or `hover:text-primary`, add dark-mode hover overrides. In dark mode `primary` is intentionally close to the app shell color, so using it as hover text can make icons disappear.

Recommended app-control hover pattern:

```tsx
<button className="border border-app-border bg-app-soft text-muted hover:border-primary hover:text-primary dark:hover:border-action-border dark:hover:bg-action-hover dark:hover:text-app-text">
	...
</button>
```

For select-like toolbar fields, keep the text stable and only make the border/ring readable:

```tsx
<label className="border border-app-border bg-app-soft text-app-text hover:border-primary focus-within:border-primary dark:hover:border-action-border dark:focus-within:border-action-border dark:focus-within:ring-action-ring/25">
	<select className="bg-transparent text-app-text outline-none" />
</label>
```

### Floating App Menu

```tsx
<div className="rounded-lg border border-app-border bg-app-panel/82 shadow-soft">
	<button className="hover:bg-app-soft">...</button>
</div>
```

### Dialog Form

```tsx
<aside className="border border-dialog-border bg-dialog-panel">
	<input className="border border-dialog-border bg-dialog-soft text-app-text" />
</aside>
```

### Secondary Action Button

For non-icon buttons with visible text, use `Button` from
`apps/web/src/components/ui/Button.tsx`. The component applies shared `.button`
classes from `apps/web/src/styles.css`, so button padding, border, focus,
disabled state, hover state, and dark-mode behavior stay consistent.

For ordinary secondary actions in app chrome:

```tsx
<Button variant="secondary">
	Cancel
</Button>
```

For ordinary secondary actions in dialogs:

```tsx
<Button variant="secondary" surface="dialog">
	Cancel
</Button>
```

For high-contrast action buttons:

```tsx
<Button variant="action">
	Sync now
</Button>
```

For menu and row actions, keep the same `Button` component and change only the
variant, size, alignment, or width:

```tsx
<Button variant="ghostDestructive" size="menu" align="start" fullWidth>
	Delete chat
</Button>
```

### Destructive Action Button

Use the destructive button variant:

```tsx
<Button variant="destructive">
	Delete
</Button>
```

## Do And Do Not

Do:

- Use semantic classes such as `bg-app-panel`, `bg-dialog-panel`, `text-muted`, and `border-app-border`.
- Use `app-*` tokens for persistent app chrome and chat surfaces.
- Use `app-surface-panel`, `app-surface-soft`, or their `mobile-*` variants only for rails, drawers, modal-like shells, or similar surfaces that must not reveal components behind them.
- Use `dialog-*` tokens for modal dialogs and drawers.
- Keep chat bubbles and inputs more opaque than the main shell.
- Check both light and dark mode after changing any token.
- Prefer `bg-app-panel/62` for ordinary large app shells.
- Prefer `bg-app-panel/82` for app popovers and menus.
- Prefer `bg-app-panel/92` for chat bubbles and floating message controls.
- Prefer `bg-app-soft` or `bg-app-soft/82` for nested controls inside those surfaces.
- Use `Button` for non-icon text buttons instead of repeating button padding, border, focus, and dark-mode classes inline.

Do not:

- Hard-code raw hex or `rgb(...)` values in components.
- Use `bg-white`, `bg-slate-*`, or `bg-zinc-*` for app surfaces.
- Use translucent `app-*` tokens inside modal dialogs.
- Use `dialog-*` tokens for persistent chat layout.
- Add blur as a readability fix without first adjusting surface opacity.
- Use synced surfaces for high-count repeated items such as message bubbles.
- Make text itself transparent to create visual softness.
- Use one opacity value everywhere. Shells, nested controls, chat cards, and dialogs have different jobs.
- Add new one-off text button class strings in feature components when an existing `Button` prop or variant covers the intent.

## Adding A New Component

Use this decision flow:

1. Is it a modal, drawer, alert, confirm, or settings/profile surface?
   Use `bg-dialog-panel`, `bg-dialog-soft`, and `border-dialog-border`.

2. Is it a large persistent app region?
   Use `bg-app-panel/62` plus `border-app-border`. If another layer moves behind it, use `app-surface-panel`.

3. Is it a small nested control or card inside app chrome?
   Use `bg-app-soft`, or `bg-app-soft/82` when it needs stronger readability.

4. Is it a chat bubble or floating control over message content?
   Use `bg-app-panel/92` plus `border-app-border`.

5. Is it a primary command?
   Use `bg-primary text-white hover:bg-primary-600`, unless it is the send/action button pattern that already uses `action-*`.

6. Is it destructive?
   Use the red danger pattern.

## When To Add Tokens

Add a new token only when it represents a repeated semantic role. Good token candidates:

- A new repeated warning surface.
- A new success surface.
- A new separate layer type with different opacity behavior.

Avoid new tokens for one-off component styling. Use existing semantic tokens first.

When adding a token:

1. Add it to `@theme`.
2. Add light value under `:root`.
3. Add dark value under `.dark`.
4. Document the intended use in this file.
5. Replace raw component classes with the new semantic utility.
