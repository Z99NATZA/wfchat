# Mistwater

Mistwater is a standalone client-only nature arcade game at `/mistwater`. It is
available from the activity bar without login and has no story, quests, room,
chat, reward, persistence, or backend behavior.

## Player Experience

The player steers a breeze around a top-down forest wetland with WASD, arrow
keys, click-to-move, pointer dragging, or touch dragging. Passing through a
sleeping flower wakes it. Waking another flower within 5.5 seconds extends the
current flow streak; a later flower starts a new streak. Woken flowers rest for
16 seconds and then become available again, so play continues without a round
timer or terminal state.

The sidebar shows total blooms, current flow, best flow, controls, and a local
reset action. Narrow viewports keep total blooms and current flow over the game
surface. Resetting or leaving the route clears the run.

## Rendering And Ownership

`apps/web/src/pages/MistwaterPage.tsx` composes the shared app shell and owns the
React snapshot. `apps/web/src/features/mistwater/` owns the Phaser surface,
scene, controls, bloom loop, and pure score transition. The route is lazy-loaded,
so Mistwater and Phaser do not add to the initial Chat route module graph.

The scene uses a fixed 1600×992 layered world. The versioned
`mistwater-terrain-v2.webp` image contains only terrain and shorelines;
`mistwater-scenery-v1.webp` is a transparent six-frame atlas for trees, rocks,
reeds, lily pads, bridges, and movable islets. Both assets live under
`apps/web/public/images/mistwater/`.

`apps/web/src/features/mistwater/game/mistwaterMap.ts` is the editable map
source. It defines every scenery object by stable id, kind, position, optional
variant, scale, and rotation. The same file defines bloom points, fog veils,
water-current paths, player start, and the logical water and land areas used by
map validation. Changing an object does not require regenerating the terrain.

Phaser continuously moves water-current highlights, ambient ripples, fog,
trees, reeds, lily pads, and the player-controlled breeze. The camera follows
the breeze and adjusts zoom to the game viewport without changing world-space
input coordinates.
