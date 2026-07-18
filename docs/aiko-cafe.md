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
- Players see names, four-direction idle/walk state, movement, joins, leaves,
  reconnect status, and preset emotes.
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
generic sync queue.

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
`error`.

## Aiko And Privacy

Aiko uses a dedicated transparent cafe world sprite at
`apps/web/public/images/aiko-cafe/aiko-host-v1.png`. The room map is
`cafe-room-v1.png`. Existing PNGTuber expressions are reused only as dialogue
portraits.

Current cafe dialogue is deterministic and derived only from public room
events. It does not call an AI provider or load automatic memory. Owner-scoped
learned context must never be inserted into public room messages. Free-text
public chat is not part of this MVP.

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
