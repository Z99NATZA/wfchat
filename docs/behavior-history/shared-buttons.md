# Shared Buttons Behavior History

This file records decisions for shared non-icon command button styling. The
current contract lives in `docs/components.md` and `docs/theme.md`.

## 2026-06-28 - Centralize non-icon command buttons

Status: Active

Previous behavior:
- Text command buttons repeated Tailwind class strings across dialogs, chat surfaces, settings, and panels.
- Padding, borders, hover colors, disabled state, and dark-mode overrides varied by feature.

Problem observed:
- The inconsistent styling made buttons hard to copy safely and easy to regress when theme tokens changed.

Decision:
- Non-icon buttons with visible text should use `Button` from `apps/web/src/components/ui/Button.tsx`.
- Button color, border, padding, focus, hover, disabled, and dark-mode behavior should come from shared `.button` classes in `apps/web/src/styles.css`.
- Menu items, row selectors, segmented options, and switch rows should use `Button` when they are text buttons, changing only `variant`, `size`, `align`, `surface`, and `fullWidth` as needed.
- Icon-only controls stay on `IconButton` or icon-only local controls when they need specialized behavior.

Why:
- Centralizing the command-button contract keeps light and dark theme behavior token-driven while avoiding one-off feature styling for common actions.

Regression guard:
- Run the web build after changing button variants or token mappings.
- Manually check representative app and dialog buttons in light and dark mode after token changes.

Related current contract:
- `docs/components.md`
- `docs/theme.md`

Related implementation:
- `apps/web/src/components/ui/Button.tsx`
- `apps/web/src/styles.css`

## 2026-06-28 - Centralize icon-only buttons

Status: Active

Previous behavior:
- Icon-only buttons used a mix of `IconButton` plus feature-local class strings and raw `<button>` elements.
- Delete, settings, code-copy, message actions, drawer close, composer send, and avatar toolbar controls each carried their own color, hover, focus, size, or disabled classes.

Problem observed:
- Icon controls could drift from the header-bar settings/delete visual behavior and require per-feature dark-mode fixes.

Decision:
- Icon-only controls should use `IconButton` from `apps/web/src/components/ui/IconButton.tsx`.
- Icon color, border, size, hover, focus, disabled, and dark-mode behavior should come from shared `.icon-button` classes in `apps/web/src/styles.css`.
- Use `variant`, `size`, and `fullWidth` for visual differences; keep `className` limited to layout and responsive visibility.
- Raw `<button>` remains acceptable for non-control backdrops and component implementation internals.

Why:
- Keeping icon-only controls on the same component preserves the header-bar visual behavior while allowing context-specific variants such as `danger`, `ghost`, `ghostDanger`, `selected`, and `action`.

Regression guard:
- Run the web build after changing icon variants or token mappings.
- Manually check header settings/delete, composer send, message copy, drawer close, and small menu icons in light and dark mode after token changes.

Related current contract:
- `docs/components.md`
- `docs/theme.md`

Related implementation:
- `apps/web/src/components/ui/IconButton.tsx`
- `apps/web/src/styles.css`
