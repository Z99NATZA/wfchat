# Aiko Cafe

Aiko Cafe is WFChat's guest-first social co-op game. It runs separately from
chat and is available at `/cafe` without login.

## Player Experience

- `/cafe` supports Quick Join, Create Room, and Join by Code.
- A room supports 1-8 players. Quick Join selects the busiest public room with
  space; a created room also gets a six-character invite code.
- The optional cafe name applies only to the current browser tab. If empty, the
  game uses the account display name or a stable `Guest XXXX` name.
- Desktop controls are WASD or arrow keys plus `E`. Mobile uses on-screen
  movement and interaction controls. The movement pad and action button share
  one bottom control zone, while reactions open vertically above the action
  button so the controls do not overlap.
- First-time guidance and nearby prompts explain the current activity. Help
  remains available from the activity HUD.
- Room members can exchange short text messages in a collapsible panel. New
  messages also appear briefly above the sender's avatar, while join and leave
  notices and unread counts make other visitors visible without interrupting
  play. The chat icon remains in place and toggles the panel at every viewport
  size; the panel close button provides the same close action.
- Activities rotate through Tea Delivery, Table Service, and Cafe Rush. Tea
  Delivery places three leaves around the Cafe for players to collect and return
  to Aiko. Table Service lets players collect one prepared drink at a time from
  Aiko and deliver it to the matching marked table.
- Table Service has three server-owned orders. An order can be claimed by only
  one player, and disconnecting releases that player's unfinished order.
- Cafe Rush is a 90-second shared round. Its target scales from three orders for
  one player up to six orders for four or more players. Players collect glowing
  ingredients, prepare drinks at Aiko's counter, then any player can claim each
  prepared drink and deliver it to the marked table.
- Rush deliveries made within 15 seconds of the previous delivery extend the
  shared combo. Disconnecting returns carried Rush ingredients and claimed
  drinks so another player can continue. A timed-out Rush moves to intermission
  without awarding a star and never blocks later rounds.
- Completing an activity starts an eight-second intermission before the next
  round. Each connected player can receive one Cafe Star per completed round.
- Cafe Stars unlock the server-owned Sakura Pin, Mint Scarf, Tea Hat, and Cafe
  Apron at 0, 3, 5, and 8 stars. Equipped items are visible to all room members
  in real time.
- The camera follows the local player with a dead zone and keeps the room at a
  readable scale. Small viewports show part of the room instead of shrinking
  the whole map.
- Player avatars use a local four-direction chibi sprite sheet. The existing
  authoritative `direction` and `moving` fields select idle and walk frames;
  player colors remain visible through the foot ring while cosmetics and
  carried items render as separate overlays.

The Phaser game loads only on `/cafe/rooms/:roomId`, so it is excluded from the
initial chat bundle. Active rooms and gameplay simulation live in the API
process; empty rooms are removed.

The Cafe uses `cafe-room-v1.png` as one background image in a fixed 1280x800
world. The API-owned `cafe-room-v1` map layout defines the world bounds,
10-pixel player foot radius, interaction distances and positions, and
rectangular footprints for the service counter and all five tables. Camera
scaling, viewport size, device pixel ratio, and browser zoom affect rendering
only and do not change this world geometry.

## Identity And Persistence

Cafe APIs use the existing HTTP-only `wfchat_session` cookie. Missing sessions
become guests automatically.

The temporary cafe name is stored in `sessionStorage`, limited to 24 Unicode
characters, and sent again on reconnect. It is never written to the account
profile or database.

Cafe Stars, unlocks, equipped cosmetics, and reward records are stored in
PostgreSQL. Guest progress moves to the registered owner after login. Rewards
are idempotent per room, round, and session. Cafe progress does not use browser
local storage or the generic sync queue; only first-visit guide dismissal is a
local UI preference.

## API And Realtime Contract

Lobby, progress, and cosmetic operations use `/api/cafe/*`:

- `GET /api/cafe/progress` returns stars, catalog thresholds, unlocks, and the
  equipped item.
- `POST /api/cafe/cosmetics/equipped` accepts an unlocked catalog id or `null`.
- `GET /api/cafe/rooms/:roomId/ws?nickname=<temporary-name>` opens the
  authenticated room WebSocket. `nickname` is optional.

WebSocket client messages are `move`, `interact`, `emote`, `chat`, and `ping`.
Server messages are `welcome`, `snapshot`, localized-key `dialogue`, `emote`,
`chat_event`, `chat_error`, targeted `reward`, `pong`, and `error`. Welcome
messages include up to 30 recent room chat and presence events. Room snapshots
identify `tea_delivery`,
`table_service`, or `cafe_rush`. Service snapshots include order table, drink,
preparation, claim, and delivery state; Rush snapshots also include its deadline
and current and best combo. Each room state carries the versioned authoritative
map layout used by the client. Stable terminal error codes are `room_not_found`,
`room_full`, and `rate_limited`.

The API is authoritative for room capacity, collision, coordinates, movement
speed, activity rotation, inventory, Table Service claims, completion, rewards,
Cafe Rush deadlines, order preparation, combo windows, player-count scaling,
cosmetics, and allowed emotes. It validates browser origins, message rate, JSON
shape, interaction distance, target ownership, and monotonic movement sequence
numbers. Room chat is normalized and limited to 200 characters, rejects control
characters and common web-link prefixes, and allows at most five messages per
connection in ten seconds. The client predicts local movement from the
server-provided layout and interpolates remote snapshots; it contains no
independent collider constants.

When the browser goes offline, gameplay input stops immediately. Controls
resume only after a reconnected socket receives a fresh `welcome` snapshot.
Silent connections close after a 25-second heartbeat timeout. Reconnect uses
bounded exponential backoff for five attempts, then shows Try again and Back
to lobby actions.

## UI And Privacy Rules

Persistent React UI inside the game surface—including the activity HUD, room
status, movement and interaction controls, room chat, Aiko dialogue, and
reactions—uses the Cafe game palette. Surrounding application chrome and
interruption surfaces—including the header, sidebar, details, guide, recovery,
and connection states—use the shared application theme. The Phaser map,
characters, items, and in-world markers also use the Cafe game palette.

On narrow viewports, the activity HUD and room status share a top row without
overlap. The HUD keeps the activity, round, and progress visible in a compact
card; active-round guidance opens through Help, while time-sensitive round and
carried-item status remains visible in compact form. Chat and transient
dialogue stay above the bottom control zone, and the reaction control is hidden
while either of those overlays is open.

The Cafe game surface suppresses text selection, native touch callouts, and
dialogue-image dragging so touch controls do not open browser selection UI.
Room chat explicitly restores normal text selection and input editing.

Development builds show the authoritative obstacle rectangles, interaction
points, and local player collision radius when a room URL includes
`?debugCollision=1`. Normal rendering never shows this overlay.

Cafe dialogue is deterministic and uses public room events only. It does not
call an AI provider or load automatic memory. Never expose owner-scoped learned
context in a room. Room chat is ephemeral, text-only, scoped to the current Cafe
room, and removed with the room; it is not written to PostgreSQL or automatic
memory.

## Ownership

- Lobby and room pages: `apps/web/src/pages/CafePage.tsx` and
  `apps/web/src/pages/CafeRoomPage.tsx`
- Frontend game, WebSocket hook, and services: `apps/web/src/features/cafe/`
- Backend room and protocol: `apps/api/src/cafe.rs`
- Durable store: `apps/api/src/store/cafe.rs`
- Migrations: `apps/api/migrations/202607180001_aiko_cafe_mvp.sql`,
  `202607190001_aiko_cafe_round_rewards.sql`, and
  `202607190002_aiko_cafe_cosmetic_loadouts.sql`

## Current Limits

Rooms do not survive an API restart and are not shared across API instances.
The game has one map, three rotating activities, and four cosmetics. It has no
regional matchmaking, moderation UI, global chat, AI room dialogue, or spectator
mode.
