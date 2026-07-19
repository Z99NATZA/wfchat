# Aiko Cafe

Aiko Cafe is the guest-first top-down social co-op area of WFChat. It is a
separate product surface from chat and is available at `/cafe` without login.

## Current MVP

- `/cafe` lists public rooms and provides Quick Join, Create Invite Room, and
  Join by Code.
- `/cafe/rooms/:roomId` loads the Phaser game only when the room route opens,
  keeping Phaser out of the initial chat bundle.
- One room supports 1-8 players. Public Quick Join prefers the busiest room
  with capacity; invite rooms use a six-character code.
- Desktop movement uses arrow keys or WASD and `E` interacts. Mobile uses an
  on-screen directional pad and interaction button.
- A first-visit guide explains the tea objective and controls. The help icon in
  the activity HUD reopens it. Nearby actions use contextual Collect tea leaf,
  Give Aiko tea, and Talk to Aiko labels instead of a generic interaction
  prompt.
- The activity HUD distinguishes delivered leaves from leaves carried by the
  current player. Available leaves have an in-world marker, and carrying tea
  reveals a marker above Aiko at the counter.
- Players see names, four-direction idle/walk state, movement, joins, leaves,
  reconnect status, and preset emotes.
- Lobby, header, side panels, forms, status messages, recovery actions, and
  React overlays above the room use the shared application theme in both light
  and dark mode. The Phaser map, characters, tea leaves, and in-world markers
  keep their own warm game palette.
- The first activity is shared tea delivery: collect three leaves and return
  them to Aiko. One player can complete it, and every player connected at
  completion earns one Cafe Star.
- Active rooms, positions, and activity simulation are process-local and
  ephemeral. Empty rooms are removed.

## Guest And Progress Ownership

Cafe APIs use the existing HTTP-only `wfchat_session` cookie. A missing session
creates a guest automatically, so login is optional. Guest names are stable for
the session and use the form `Guest XXXX`.

Cafe Stars are canonical PostgreSQL data. Guest rows are scoped by session;
after login, the existing guest-to-account promotion assigns those rows to the
registered `owner_user_id`. Registered progress is read across that account's
sessions. `cafe_room_rewards` makes completion rewards idempotent per room and
session.

Cafe progress is not written to browser local storage and does not use the
generic sync queue. Only the versioned first-visit guide dismissal is stored as
a browser-local UI preference; the guide remains available from the room HUD.

## Transport And Trust Boundary

Lobby and progress operations use HTTP under `/api/cafe/*`. Live room state
uses the authenticated WebSocket endpoint:

```text
GET /api/cafe/rooms/:roomId/ws
```

The API verifies browser `Origin` against `FRONTEND_ORIGINS` before upgrading.
It also rate-limits messages per connection, discards invalid JSON and unknown
emotes, requires monotonic movement sequence numbers, bounds movement speed and
map coordinates, and applies collision on the server. The client predicts its
own movement and interpolates remote snapshots, but the server snapshot is
authoritative. A client heartbeat closes a silent connection after 25 seconds;
the room hook then reconnects with bounded exponential backoff.

WebSocket client messages are `move`, `interact`, `emote`, and `ping`. Server
messages are `welcome`, `snapshot`, `dialogue`, `emote`, `reward`, `pong`, and
`error`. Error messages carry a stable `room_not_found`, `room_full`, or
`rate_limited` code so the client does not depend on server prose.

Missing and full invite rooms are presented as different lobby errors. A room
WebSocket that cannot be joined shows a terminal recovery panel with Try again
and Back to lobby actions instead of remaining in a connecting state. Other
interruptions reconnect with exponential backoff for at most five attempts;
after that, the same manual recovery actions are shown.

## Aiko And Privacy

Aiko uses a dedicated transparent cafe world sprite at
`apps/web/public/images/aiko-cafe/aiko-host-v1.png`. The room map is
`cafe-room-v1.png`. Existing PNGTuber expressions are reused only as dialogue
portraits.

Current cafe dialogue is deterministic and derived only from public room
events. It does not call an AI provider or load automatic memory. Owner-scoped
learned context must never be inserted into public room messages. Free-text
public chat is not part of this MVP. Dialogue, first-visit guidance, activity
HUD, invite code, emotes, interaction prompts, and mobile controls use solid
shared application surface, border, and text tokens. They follow light and dark
mode without picking up the warm map color underneath; the Phaser map and its
in-world markers keep the cafe game palette.

## Runtime Files

- Frontend feature: `apps/web/src/features/cafe/`
- Lobby and room pages: `apps/web/src/pages/CafePage.tsx` and
  `apps/web/src/pages/CafeRoomPage.tsx`
- Backend room/protocol module: `apps/api/src/cafe.rs`
- Durable store operations: `apps/api/src/store/cafe.rs`
- Schema migration: `apps/api/migrations/202607180001_aiko_cafe_mvp.sql`

## Current Limits

Rooms are not shared across multiple API processes and do not survive an API
restart. There is one map and one activity, cosmetics have persistence support
but no unlock or equip UI, and there is no matchmaking region, moderation
surface, free-text chat, AI-generated room conversation, or spectator mode.
