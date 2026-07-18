# Folder Structure

```text
apps/
	api/
			src/
				main.rs
				app.rs
				auth.rs
				cafe.rs
			chat/
				mod.rs
				messages.rs
					attachments.rs
					cafe.rs
				voice.rs
			store/
				mod.rs
				auth.rs
				chat.rs
				attachments.rs
				memory.rs
				sync.rs
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
	lessons-learned/
```

## Folder Roles

`apps/web` contains the standalone React frontend. It talks to the backend
through HTTP only.

`apps/api` contains the standalone Rust Axum backend. It owns auth, admin-only AI configuration, API keys, chat persistence, and provider adapters.

`docs/` contains documentation. Current architecture and implementation
behavior stay in its domain documents, separate from historical lessons. The
root `README.md` is intentionally limited to run commands.

`docs/lessons-learned/` records failed approaches and their reusable warnings
without describing the current replacement implementation.

## Frontend Shape

`apps/web/src/app` contains top-level app wiring. Keep this small.

`apps/web/src/pages` contains route-level screens. A page composes layouts, features, and app-level dependencies.

`apps/web/src/layouts` contains reusable page shells such as `AppLayout`, including the activity bar/sidebar/content slot contract.

`apps/web/src/features` contains domain-specific frontend code. Each feature can have its own `components`, `data`, `hooks`, and `services`.

`apps/web/src/features/avatar` contains avatar-specific metadata such as the Aiko PNGTuber expression set.

`apps/web/src/features/cafe` contains the Cafe WebSocket hook, HTTP service,
Phaser scene, game canvas, and protocol types.

`apps/web/src/components/navigation` contains app-level navigation UI such as the activity bar.

`apps/web/src/services` contains infrastructure-facing helpers such as storage, axios clients, or transport wrappers.

## Backend Shape

`apps/api/src/app.rs` wires the Axum router.

`apps/api/src/chat/mod.rs` composes chat routes and keeps chat CRUD handlers.
`apps/api/src/chat/messages.rs` keeps message preparation, completion, and SSE
streaming together so one message request remains understandable in one file.
Attachment and voice handlers live in their matching chat submodules.

`apps/api/src/store` splits PostgreSQL persistence by auth, chat, attachment,
memory, cafe, and sync domain while preserving the shared `store` API.

`apps/api/src/cafe.rs` owns the in-process room hub, authoritative gameplay
validation, WebSocket protocol, and deterministic public Aiko events.

`apps/api/src/characters.rs` keeps the static character registry and character prompts until this moves to a database.

`apps/api/src/ai/mod.rs` owns provider selection and AI profile usage.

`apps/api/src/ai/providers` keeps external provider details isolated from chat code.

`apps/api/src/admin.rs` is the boundary for admin-only AI configuration endpoints.
