# Theme

The theme system is CSS-variable driven and Tailwind CSS v4 friendly.

## Source Files

- `src/styles.css`: Tailwind import, CSS variables, theme tokens, shared component classes.
- `src/hooks/useTheme.ts`: React-facing theme API.
- `src/stores/themeStore.ts`: persistence and document class application.

## Theme Tokens

Tailwind color utilities point to CSS variables:

```css
@theme {
	--color-primary: var(--brand-primary);
	--color-app-bg: var(--app-bg);
}
```

Light theme primary:

```css
--brand-primary: #4070f4;
```

Dark theme primary:

```css
--brand-primary: #282c33;
```

## Dark Mode

Dark mode uses a class selector:

```css
@custom-variant dark (&:where(.dark, .dark *));
```

The active theme is applied to `document.documentElement`. This keeps Tailwind classes stable while allowing theme values to change through CSS variables.

## Adding Tokens

Add tokens only when they represent a repeated design decision. Prefer semantic names such as `app-panel` or `muted` instead of one-off color names.
