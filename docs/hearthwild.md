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
WASD, arrow keys, click-to-walk and a touch directional pad move the character.
E interacts with nearby doors, resources, crops, treasure and the bed. Space
attacks nearby cavern slimes; F consumes food to restore 25 health. The backpack
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

Slimes deal 12 damage with a 1.4-second player damage cooldown. A sword hit
requires distance below two tiles and has a 0.35-second cooldown. Zero health
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
ground tiles. Player poses face four directions; walking adds movement bob.
There is no multi-frame leg animation. The atlases were produced using the
built-in imagegen tool; their final prompts are recorded in the adjacent
`art-prompt.txt` and `interior-art-prompt.txt`. No external asset host is required at runtime.

## Focused verification

```sh
cd apps/web
npx vitest run src/features/hearthwild/state.test.ts src/components/navigation/ActivityBar.test.tsx
npx playwright test e2e/hearthwild.spec.ts
```
