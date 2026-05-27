# Folder Structure

```text
src/
	app/
		App.tsx
	components/
		ui/
			IconButton.tsx
			StatusDot.tsx
	features/
		chat/
			components/
			data/
			hooks/
			services/
	hooks/
	layouts/
	pages/
	services/
	stores/
	types/
	utils/
	main.tsx
	styles.css
```

## Folder Roles

`app/` contains top-level app wiring. Keep this small.

`pages/` contains route-level screens. A page composes layouts, features, and app-level dependencies.

`layouts/` contains structural layout components that do not own domain behavior.

`features/` contains domain-specific code. Each feature can have its own `components`, `data`, `hooks`, and `services`.

`components/` contains shared reusable UI. Components here should be generic and feature-agnostic.

`hooks/` contains reusable app-level hooks.

`stores/` contains app-level state adapters and persistence rules.

`services/` contains infrastructure-facing helpers such as storage, API clients, or transport wrappers.

`utils/` contains pure utilities with no React dependency.

`types/` contains cross-feature TypeScript types.
