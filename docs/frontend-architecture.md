# Frontend Architecture

The frontend is a standalone ReactJS + TypeScript app in `apps/web`. It is kept close to the backend in this repo, but it should behave like a deployable client that can move out later.

## API Boundary

Frontend code calls the backend through axios from `apps/web/src/services/apiClient.ts`.

```text
VITE_API_BASE_URL=http://localhost:8080
```

For local non-Docker development, `VITE_API_BASE_URL` points at the API port directly. For Docker web builds, `VITE_API_BASE_URL` is intentionally empty so requests stay relative to the web origin and nginx proxies `/api/*` to the API container. This lets LAN clients use only the web port.

The frontend should not import backend code, read backend files, or know provider/model names.

## Runtime Flow

```text
apps/web/src/main.tsx
  -> apps/web/src/app/App.tsx
      -> apps/web/src/layouts/AppLayout.tsx
      -> apps/web/src/pages/ChatPage.tsx
      -> apps/web/src/pages/CafePage.tsx
      -> apps/web/src/pages/CafeRoomPage.tsx
      -> apps/web/src/pages/PngTuberPage.tsx
      -> apps/web/src/pages/Model2DPage.tsx
```

The chat UI uses `apps/web/src/features/chat/services/chatApiService.ts` to
create/load chats and send messages through the Rust backend. Browser auth uses
the backend-issued HTTP-only `wfchat_session` cookie; frontend services call
`apps/web/src/services/sessionService.ts` only to bootstrap that cookie and keep
a non-secret `wfchat.sessionCookieReady` sessionStorage marker. Message sends
try the SSE streaming endpoint first and fall back to the non-streaming endpoint
if the stream fails before it starts.

Local chat image attachments are supported for PNG, JPEG, WebP, and GIF files.
The composer can select images from the device, paste clipboard images, and
accept drag/drop images. The browser creates `blob:` URLs only for pending
previews, uploads image bytes to the backend before send, and sends only
backend-issued attachment ids in chat message requests.

The current supported chat companion is Aiko only. If a browser has no stored session/chat history, the message list starts empty.

The clear chat button in the header is supported. It calls `DELETE /api/chats/:chat_id/messages` after a browser confirmation and leaves the current chat/session intact.

Chat layout and scroll contract (single-scroll message timeline, sticky header/composer): `docs/chat-layout-scroll.md`.

Mobile browser viewport and safe-area scope: `docs/mobile-viewport.md`.

Chat message rendering scope and rich-format rules: `docs/chat-message-rendering.md`.

Chat voice scope covers assistant voice playback and push-to-talk user speech
input: `docs/chat-voice.md`.

Current chat message rendering:

- User and assistant messages still use `ChatMessage.text` as the primary text content field.
- User messages render as plain text.
- User messages can render image attachment thumbnails from authenticated backend preview URLs.
- Assistant messages render a safe Markdown subset through the frontend renderer.
- Assistant bubbles are wider than user bubbles to improve readability for structured Markdown such as tables and code blocks.
- Assistant messages with non-empty text expose a copy action for the raw message text.
- Assistant messages can expose an AI voice playback action when backend chat UI config reports assistant speech support.
- App Settings can show backend-provided non-secret voice credit text, such as
  VOICEVOX attribution, without exposing provider controls.
- VOICEVOX tuning stays backend-owned; the normal chat UI does not expose
  speed, pitch, intonation, volume, speaker, provider, model, or API key
  controls.
- The composer can expose push-to-talk speech input when backend chat UI config
  reports user transcription support. Successful transcripts fill the composer
  draft and are not sent until the user sends the message.
- Quick prompts from `/api/chat-ui/config` render as chips above the composer. Selecting a chip fills the composer draft and focuses the textarea; it does not auto-send.
- In development mode or local Docker builds with `VITE_ENABLE_MARKDOWN_QA=true`, `/chat?qa=markdown` exposes a local-only `Load QA` action for Markdown rendering fixtures. Chat route ids must be UUIDs so invalid paths such as `/chat/qa` do not call `/api/chats/:chat_id`.
- Assistant streaming uses one optimistic local assistant message with id prefix `local-assistant-`.
- While that optimistic assistant message exists, the message list should render loading text inside that placeholder only when it has no token text yet, and should not render a second standalone thinking bubble.
- Supported assistant formats and explicit non-goals are defined in `docs/chat-message-rendering.md`.

The Cafe lobby uses normal React service calls. Its room route lazy-loads Phaser,
then `useCafeRoom` owns the WebSocket lifecycle while `CafeScene` owns predicted
local movement, remote interpolation, camera, collision visuals, and mobile
input. See `docs/aiko-cafe.md` for the protocol and ownership boundary.

The PNGTuber workspace renders Aiko with a lightweight PNG asset set before Live2D rigging. The Live2D page is currently a route shell only. Runtime notes, chat bridge behavior, and remaining avatar work are documented in `docs/pngtuber.md`.

App-level page navigation uses the left activity bar and route map described in `docs/app-navigation.md`. The app currently supports chat, Aiko Cafe, PNGTuber Studio, and a reserved Live2D workspace shell.

Auth/profile UI lives in `apps/web/src/components/auth/AuthProfileDialog.tsx`. It renders as a desktop right drawer and mobile bottom sheet, uses Google sign-in for login, and lets signed-in users edit `display_name` and `avatar_url` through `PATCH /api/auth/profile`.

App-level persisted settings live behind `apps/web/src/app/AppSettingsProvider.tsx`. Pages receive settings and callbacks from the app boundary instead of owning persisted app settings directly.

## Rules

- Frontend quality gates live in `apps/web/package.json`: `lint`,
  `format:check`, `test`, and `build`. CI runs lint and format checks before
  tests and production build. The lint script uses `--max-warnings=0`.
- Keep Fast Refresh component files limited to component exports. Shared
  hooks, constants, contexts, and helpers should live in adjacent non-component
  modules.
- Keep chat UI focused on chats, characters, and messages.
- Do not expose provider, model, or API key fields in normal chat screens.
- Use admin screens for AI profile configuration later.
- Keep `VITE_*` variables limited to non-secret browser configuration.
- Put reusable browser infrastructure in `apps/web/src/services`.
- Keep unsupported controls disabled and visually muted. This currently includes arbitrary file attachments, image generation prompts, search, notifications, chat modes, response-shape controls, and safety toggles.
- Supported controls currently include theme toggle, settings, send message,
  quick prompts, image attachment selection, clear chat, assistant speech
  playback, and push-to-talk speech input when the backend enables them.
