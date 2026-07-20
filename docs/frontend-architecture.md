# Frontend Architecture

The browser app is React 19 + TypeScript under `apps/web`. It is feature-first
and communicates with the backend only through HTTP, SSE, and the Cafe
WebSocket.

## Runtime

```text
main.tsx
  -> AppSettingsProvider + i18n + router
  -> App.tsx
      -> DialogProvider + AvatarRuntimeProvider
      -> route page
      -> AppLayout
      -> feature hooks, services, and components
```

`apiClient.ts` is the shared Axios boundary. Chat streaming, authenticated
image/audio fetches, uploads, and WebSocket use the browser primitives needed by
those transports. Every browser API request relies on the HTTP-only session
cookie prepared by `sessionService.ts`.

`VITE_API_BASE_URL` points to the API during separate local development. The
Docker web build leaves it empty so nginx proxies same-origin `/api/*`
requests.

## Code Ownership

| Path | Role |
| --- | --- |
| `app/` | Application providers and cross-route orchestration |
| `pages/` | Route composition |
| `layouts/` | Shared page shells |
| `features/` | Chat, avatar, and Cafe behavior |
| `components/` | Reusable app UI, dialogs, auth, settings, navigation |
| `services/` | API/session/storage/sync infrastructure |
| `stores/` | Browser persistence helpers and small shared stores |
| `hooks/` | Cross-feature React adapters |
| `types/`, `utils/`, `i18n/` | Shared contracts and utilities |

Import downward:

```text
app -> pages -> layouts/features -> components/hooks/services/stores/utils/types
```

Shared layers must not import page- or feature-specific behavior.

## Feature Boundaries

- Chat lifecycle stays in `useChatSession`; rendering components receive state
  and callbacks. Streaming is attempted first, with JSON fallback only before
  the SSE stream starts.
- App settings and auth/sync orchestration live above routes. Feature pages do
  not own persisted global settings.
- Avatar runtime stores semantic expression/motion state. Chat emits semantic
  events and never imports PNG renderer details.
- Cafe lobby uses React services. The room route lazy-loads Phaser;
  `useCafeRoom` owns transport and `CafeScene` owns simulation/rendering.
- Image bytes, voice providers, models, credentials, and automatic memory remain
  backend-owned.

## UI Rules

- Use shared `Button`, `IconButton`, dialog primitives, i18n keys, and
  semantic theme tokens.
- Keep unsupported controls disabled or absent; do not expose provider, model,
  API-key, search, generation-mode, or safety configuration in chat.
- User messages render plain text; assistant messages render the supported safe
  Markdown contract.
- Keep the app shell fixed to the dynamic viewport and feature content inside
  its owned scroll region.
- `VITE_*` values must be non-secret browser configuration.

## Quality Gates

```powershell
npm --prefix apps/web run lint
npm --prefix apps/web run format:check
npm --prefix apps/web test
npm --prefix apps/web run build
```

ESLint runs with zero allowed warnings. Prettier is the formatting authority.
