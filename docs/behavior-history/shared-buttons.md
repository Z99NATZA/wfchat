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
