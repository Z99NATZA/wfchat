# Hearthwild

Hearthwild is an independent, client-only top-down garden adventure at
`/hearthwild`, available from the navigation rail without login. It does not
use Mistwater, Cafe state, or backend persistence.

`apps/web/src/features/hearthwild/` owns the simulation, grid maps, Canvas 2D
renderer, controls and React HUD. `apps/web/src/pages/HearthwildPage.tsx`
composes the app shell. The route is lazy-loaded. English and Thai UI follow
the app locale.

## World and controls

The garden, cottage interior and cavern are separate maps with explicit doors.
The garden's five southern rows (23–27) are water across the entire map width,
joining the existing pond and ending the southbound path at the shore. Terrain,
collision, placement, water rendering and the minimap share this water boundary.
The lake uses a stationary deep-teal surface with shallow shoreline light,
submerged stones and local depth variation. It has no animated wave, caustic or
specular effects. The pond and southern water share one open connection and one
continuous outer bank, without a shoreline drawn across the joining water. The
visual shoreline uses deterministic sub-tile contours to soften the collision grid's
long straight banks and stair-step pond edges. A layered wet-soil bank, moss,
shallow-water tint, small stones and grass tufts make the land-water transition
read as a natural shoreline without changing collision.
Existing saves remove objects and ground edits from the flooded strip and
refund materials for player placements. A saved player on the former land is
moved to the nearest open dry tile while keeping progress and sleep state.

WASD, arrow keys, click-to-walk and a touch directional pad move the character.
Hold Shift while moving, including click-to-walk, to run at 5.8 tiles per second
instead of walking at 3.5; diagonals retain the same speed and collision rules.
Touch controls include a hold-to-run button. E interacts with nearby doors,
resources, crops, treasure and the bed. Q or the weapon buttons select sword or
bow; Space attacks in the facing direction. F consumes food to restore 25 health. The backpack
also provides an eat action. Interaction sounds can be enabled from the HUD.

Tools 1–8 select exploration, paths, soil, carrot seeds, lanterns, fences, trees
and removal; G toggles the grid and I opens the backpack. Placement is limited
to 4.5 tiles from the player's center and validates occupancy, terrain,
materials and portal access. Doors, the player tile and fixed structures are
protected. Solid placement must preserve a traversable route to every map
exit. Removing placed objects returns their material cost. Indoor lanterns and
fences are supported; soil, carrots and trees belong in the garden.

Carrots require tilled soil and mature after 90 world minutes (75 active real
seconds). Harvesting grants food, coins and seeds. Wood, mushrooms, rocks,
crystals and chests can be collected; chests grant their contents once. The
journal tracks three harvests, three crystals and three garden decorations.

## Sleep and failure

The player can stay awake for 600 active real seconds. A warning appears with
60 seconds remaining. Using the cottage bed starts safe sleep. Reaching zero
awake time starts involuntary sleep where the player stands. Outdoor collapse
has a 45% injury chance, increased to 85% inside the cavern; injury costs 35
health and a quarter of coins. Otherwise the player wakes unharmed.

Sleep darkens the entire game stage for 10 active real seconds. Completing
sleep advances world time exactly six hours, restores up to 45 health, resets
the awake timer and respawns cavern enemies. Awake time advances the world at
1.2 game minutes per active real second. Menus, manual pause and hidden tabs
pause simulation, including sleep. Reloading does not simulate offline time.

Slimes deal 12 damage with a 1.4-second player damage cooldown. Sword swings
last 0.4 seconds, with damage at the slash frame after 0.2 seconds; a hit
requires distance below 1.9 tiles and the facing half-plane, except contact
within 0.6 tiles. Bow attacks last 0.64 seconds and release after 0.32 seconds.
Arrows travel at 12 tiles per second for up to nine tiles, stop at solid
geometry, and damage only the first enemy hit. Both weapons deal one damage;
three hits defeat a full-health slime. Movement, turning and weapon switching
are locked during attacks. Sleep, rescue, map travel and save loading clear
active attacks and arrows. Weapon choice survives reloads; existing v1 saves
without weapon data select the sword. Zero health
rescues the player to the cottage at 60 health, charges half the remaining
coins, and starts sleep. This is a recoverable defeat, not permanent death.

Progress, grid edits, collected rewards, enemy health and sleep progress save
under `wfchat.hearthwild.v1` in localStorage every five seconds, on interactions,
and when hiding or leaving the page. Invalid saves start a fresh world. Storage
failure keeps the game playable and displays a save failure indicator.

## Artwork

Original transparent woodland and interior atlases live at
`apps/web/public/images/hearthwild/woodland-atlas-v1.png` and
`apps/web/public/images/hearthwild/interior-atlas-v1.png`. `render.ts` owns their
source rectangles and draws independent objects above procedural textured
ground tiles. Garden grass, paths and foliage use a dark blue-green palette;
the still-water presentation in `water.ts` uses Mistwater's deep-water and
shallow-light color language in a lower-resolution style that matches the garden.
The cottage keeps its warm interior colors. A cached foliage material
preserves wood, roofs and light sources. `appearance.ts` defines deterministic
tree width and height variation from object coordinates. Tree sprites remain
stationary and keep their grid anchor and collision tile at the trunk.

Between 18:00 and 06:00, the garden has a soft pool of visibility centered on
Aiko's body. The clear inner radius is 0.75 tiles and fades into the dark
ambient scene by 4.5 tiles. Distant scenery retains a dim blue-green silhouette
for navigation; the night edge vignette is limited to avoid black corners.
The pool follows world position and scales with camera zoom. Existing lantern
glows remain visible. `lighting.ts` owns this garden overlay; daytime and the
cottage/cavern lighting retain their separate rendering behavior.
The Light test control under the journal switches the rendered lighting between
day and night. Auto restores the game clock. This temporary preview changes no
simulation time, sleepiness, crop growth or save data; it resets on leaving or
reloading the game.

Aiko is the playable character, based on the main app's
`apps/web/public/images/aiko-avatar.png`: navy-black hair with blue streaks,
side braid, blue-violet eyes and blue jewelry, with an ivory and navy adventurer
outfit. `animation.ts` owns five animation actions and their source row mapping,
mirroring, frame rates and playback rules:

| Action | Asset under `apps/web/public/images/hearthwild/` | Rate     | Playback                                     |
| ------ | ------------------------------------------------ | -------- | -------------------------------------------- |
| Idle   | `aiko-idle-v2.png`                               | 2 fps    | Breathing loop; 120 ms blink every 5 seconds |
| Walk   | `aiko-walk-{front,back,side}-v2.png`             | 16 fps   | 8-frame loop; left mirrors right             |
| Run    | `aiko-run-{front,back,side}-v2.png`              | 24 fps   | 8-frame grounded loop; left mirrors right    |
| Sword  | `aiko-sword-v1.png`                              | 10 fps   | Once per attack                              |
| Bow    | `aiko-bow-v1.png`                                | 6.25 fps | Once per attack                              |

`playerSprites.ts` registers the idle, walk and run artwork once at load time. Its
96-pixel cells align the head center and foot baseline, normalize body height,
and use explicit source row boundaries to retain complete boots. Tiny isolated
opaque fragments are filtered before registration; substantial accessories
and connected limbs remain. Idle uses a
fixed lower-body layer so its feet and coat hem do not shuffle during breathing.
The blink frame is displayed briefly rather than held for a whole breathing
step. Walking and running use separate front, back and right-profile source sheets;
the same profile supplies the mirrored left view throughout each cycle. The
run cycle keeps a supporting boot at the ground baseline and uses restrained
rear-leg recovery instead of tucked, floating poses. All locomotion actions
share the same normalized body height and foot anchor.

The renderer selects actual sprite frames rather than translating a standing
pose. Walking phase advances by distance actually traveled, including collision
sliding. Passing click-to-walk waypoints does not enter idle or restart the gait;
switching between walk and run preserves the current cycle phase. Stopping or
blocked movement returns to idle. Attack changes start their own sequence.
Animation time follows active simulation time, including pause and hidden-tab
behavior. All source sheets load before the world starts; failed or empty
artwork displays the retry control. The irregular bow rows have explicit source
bounds so its weapons and boots remain visible.

All raster assets were generated with the built-in imagegen tool. Woodland and
interior prompts are in `art-prompt.txt` and `interior-art-prompt.txt`; Aiko's
prompts are the adjacent `aiko-<action>-prompt.txt` files for v1 artwork and
`aiko-<action>-v2-prompt.txt` files for the idle and directional walk/run artwork. No external asset
host is required at runtime.

## Focused verification

```sh
cd apps/web
npx vitest run src/features/hearthwild
npx playwright test e2e/hearthwild.spec.ts
```
