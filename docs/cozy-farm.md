# Cozy Fantasy Farm

`/cozy-farm` opens a separate client-only farming game from the activity bar.
`apps/web/src/features/cozy-farm/` owns its implementation. It does not import
Mistwater or Cafe gameplay, assets or saves. The shared app shell
still performs normal session bootstrap; gameplay requires no API.

## World and rendering

The 48 × 36 world uses 16-pixel square cells. `world.ts` owns terrain, object
footprints, collision, placement, crop simulation and versioned serialization.
`Game.ts` owns the PixiJS 8 application, ticker, input, camera and rendering.
React receives HUD snapshots four times per second rather than every frame.
`art.ts` loads transparent sprite sheets from
`apps/web/public/images/cozy-farm/`: environment, crops and seven Aiko character source sheets. Buildings,
trees, shoreline rocks, vegetation, farm props and the waterfall use individually
framed assets. The original PNG alpha is preserved; the runtime isolates each
frame's main alpha region to exclude neighboring fragments. The asset manifest
normalizes frames onto a common two-texel/world-pixel grid, with nearest filtering
and a shared render scale. Object sprites extend beyond their logical footprints.
The small sign and light/particle effects remain code-drawn.
`garden-props-v1.png` supplies the bench, mailbox, flower pot, produce crate,
watering can, basket and woodland mushrooms. `environment.ts` owns their authored
positions and checks complete artwork bounds against terrain, crops and objects.
Decorative props disappear when player edits occupy that space; they add no
collision, interactions or saved state. The produce cart sits beside the shed.

`character.ts` separates transient player velocity from animation playback. Aiko
uses four idle poses and eight complete walking/running poses per direction.
`playerSprites.ts` registers the seven source sheets into three runtime canvases
once during artwork loading. Idle supplies four facing rows; walk and run each
supply front, back and right-profile sheets, with the left profile mirrored.
Explicit row boundaries preserve complete boots. Registration uses a shared
scale per facing, bounded width correction, a head anchor and a common foot
baseline. Small isolated fragments are removed; connected limbs remain intact.
Idle retains one planted lower-body layer while the upper body breathes.

`CharacterSprite.ts` displays each complete registered pose in PixiJS. `art.ts`
normalizes the character to approximately 30 world pixels tall and caches its
textures at two texels per world pixel. `CHARACTER_SHEETS`, `FRAME_COUNTS` and
`CHARACTER_ROWS` own source selection, pose counts and facing mapping. The player
sorts by feet Y and has a separate contact shadow. All character source images
and their generation prompts live under `apps/web/public/images/cozy-farm/`.

Walking and running phase follows collision-resolved travel, with a 24-pixel
walking cycle and a 32-pixel running cycle. Changing speed preserves phase;
blocked or stopped movement returns to idle. Idle uses the source breathing
sequence at two frames per second and a 120 ms blink every five seconds.
Running uses a grounded recovery cycle. Pause and page visibility suspend
animation alongside simulation; loss of focus clears input and transient velocity.
The character renderer does not own farming state or saves.

`landscape.ts` builds a cached ground texture directly from the editable terrain
cells. Neighbor coverage rounds visible corners independently of square collision
boundaries. Bounded visual warping preserves cell centers and narrow channels;
path shoulders use a wider warp and stippled grass encroachment.
`composition.ts` defines gently curved, variable-width routes with staggered
cottage/shed junctions, a farm-gate lane and a southern dock approach. These routes
exchange only grass/path tiles; collision footprints and walkability are unchanged.
Older saves receive this path composition once, only in cells matching the original
seeded grass/path layout. Divergent terrain and crops are retained; the
`pathComposition` marker prevents later player edits from being reapplied.

A symmetric
eight-direction distance field supplies variable-depth turquoise shelves and
blue/teal basins. Warped cellular light fragments replace repeating wave stripes;
foam appears in broken shore segments. Seeded moss/grass patches, soil furrows,
stippled cultivated edges and sparse worn stones vary ground without altering
walkability. The ground
cache rebuilds only when terrain changes; crop and object changes do not repaint it.
This cached surface is not an illustration or reference-image background.

Environment sprites, underwater rocks, reeds and lilies overlap the visual shore.
Four cached shore-rock compositions reuse the original rock texture, alternating
low mossy stones and larger groups. Every blocking rock remains visible at its
existing cell. Underwater stones and reeds occur in sparse patches; lily pads
occupy four authored pockets, leaving the central lake open. Dock/rock ripples,
short wavelets, sparse fish and broken lantern reflections animate independently.
Trees use existing oak/fir art with authored foreground openings, species groups,
and smaller young trees in selected pockets. Bounded trunk offsets and staggered
canopy heights expose background trees without moving or removing blocking
footprints. Tree appearance is deterministic across reloads. Decorative clusters stay near forest and lake margins. Contact
shadows, window light pools, lamp halos and reflections add depth without blur.
Waterfall highlights, surface glints, fish, foam and ripples animate separately.
Lily pads bob within a reserved water envelope. Fading pixel smoke rises from
the measured cottage chimney; both animations use the existing paused game clock.
Actors still sort by logical feet position, and the camera/placement grid use
world coordinates. The small map renders in full without chunk streaming.

The [asset provenance and generation prompts](../apps/web/public/images/cozy-farm/ASSETS.md)
identify the built-in image generation source and atlas layout constraints. The
artwork is generated for this game, not extracted from the visual reference or
from other WFChat games.

## Controls and mechanics

- WASD/arrows walk; hold Shift with movement to run. Diagonals are normalized,
  with short acceleration/deceleration and substepped collision. Walking targets
  54 world pixels/second and running 86; transient velocity is not saved.
- 1–8 select tools. Click within four cells or press E for the nearby pointed cell
  or cell ahead. G toggles the grid; Escape pauses. Touch devices show movement buttons.
- Till, plant, water, then use the hand to harvest. Watered turnips take 45 active
  seconds; berries take 70. Harvest yields one produce and two seeds.
- The hammer menu adds paths, grass, flowers and removal. Placement validates
  entire footprints, terrain, crops, objects and the player's cell.
- Trees, fences, lamps and flowers have no material cost. Buildings and docks are
  fixed. The cottage offers flavor text without an interior. There is no fishing
  minigame, combat, economy or audio.
- Wheel and HUD buttons control zoom. The guide and controls support Thai and
  English. Pausing or hiding the document stops crop simulation.

## Persistence and lifecycle

Only `wfchat.cozy-farm.v1` in localStorage stores this world. It saves after
interactions, every five active seconds, on pause, page hide and unmount. Loading
validates dimensions, object kinds/footprints, crops, inventory and player
position. Invalid data opens a fresh garden with a notice. Storage errors show
an in-memory-only notice. There is no offline growth or cross-device sync.
Unmount during asynchronous initialization is handled. Cleanup removes listeners
and ResizeObserver, stops the ticker and destroys owned textures. Renderer
initialization failure shows a reload notice and logs the cause in the browser
console. The feature imports `pixi.js/unsafe-eval` before renderer initialization
to use static shader/uniform synchronization under nginx CSP; no `unsafe-eval`
permission is added to the web policy.

## Run and verify

From the repository root run `make run`. The existing Makefile builds and starts
the Docker Compose stack, including the web image with PixiJS. Open
`http://localhost:5173/cozy-farm`. Use `make logs` to follow container logs and
`make down` to stop the stack. See [Docker](docker.md) for initial setup.

Focused checks from `apps/web`:

```sh
npx vitest run src/features/cozy-farm
npx playwright test --config playwright.cozy-farm.config.ts
npx playwright test e2e/cozy-character.spec.ts
```

The production browser test reads CSP directly from `apps/web/nginx.conf` and
applies it to document responses. It checks asset loading, the farming and save
loop, placement and explicit failure when required artwork is missing. It also checks removal of the retired adventure route and navigation entry.
The focused character browser tests use real Canvas pixels to verify planted
idle feet, distinct walking leg artwork, consistent head scale, and grounded
running in all four directions. It mocks
shared-shell API responses and needs
no backend/database.
Screenshots are written under `apps/web/test-results`.
