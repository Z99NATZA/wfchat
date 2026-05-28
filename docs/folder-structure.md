# Folder Structure

```text
apps/
	api/
		src/
			main.rs
			app.rs
			auth.rs
			chat.rs
			characters.rs
			admin.rs
			ai/
				mod.rs
				providers/
	web/
		src/
			app/
			components/
			features/
			hooks/
			layouts/
			pages/
			services/
			stores/
			types/
			utils/
docs/
```

## Folder Roles

`apps/web` contains the standalone React frontend. It can be moved to another repo later because it talks to the backend through HTTP only.

`apps/api` contains the standalone Rust Axum backend. It owns auth, admin-only AI configuration, API keys, chat persistence, and provider adapters.

`docs/` contains architecture and implementation notes. The root `README.md` is intentionally limited to run commands.

## Frontend Shape

`apps/web/src/app` contains top-level app wiring. Keep this small.

`apps/web/src/pages` contains route-level screens. A page composes layouts, features, and app-level dependencies.

`apps/web/src/features` contains domain-specific frontend code. Each feature can have its own `components`, `data`, `hooks`, and `services`.

`apps/web/src/services` contains infrastructure-facing helpers such as storage, axios clients, or transport wrappers.

## Backend Shape

`apps/api/src/app.rs` wires the Axum router.

`apps/api/src/chat.rs` keeps chat routes and flow close together so one chat request is understandable in one file.

`apps/api/src/characters.rs` keeps the static character registry and character prompts until this moves to a database.

`apps/api/src/ai/mod.rs` owns provider selection and AI profile usage.

`apps/api/src/ai/providers` keeps external provider details isolated from chat code.

`apps/api/src/admin.rs` is the boundary for admin-only AI configuration endpoints.
