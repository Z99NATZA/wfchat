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

The scene uses a fixed 1792×896 compact pond world. The versioned
`mistwater-pond-v3.webp` background contains the non-interactive shoreline,
forest, stones, and aquatic vegetation needed for cohesive depth and lighting.
It lives under `apps/web/public/images/mistwater/`. Interactive flowers are
small Phaser shape groups so their colors, scale, and motion remain editable in
code without another raster asset.

`apps/web/src/features/mistwater/game/mistwaterMap.ts` is the editable gameplay
map source. It defines bloom points, curved water-current paths, surface glints,
eddies, player start, and overlapping logical pond zones used by movement and
validation. Changing an interactive object or water effect does not require
regenerating the background.

Phaser continuously moves layered water-current highlights, surface shimmer,
eddies, ambient ripples, interactive flowers, and the player-controlled
breeze. A moving breeze leaves alternating wake ripples and sparkles. The
breeze is constrained to the logical pond and slides along its irregular shore.
The camera follows the breeze and adjusts zoom to the game viewport without
changing world-space input coordinates. The renderer uses antialiasing rather
than pixel-art sampling so the detailed background remains smooth while scaled.
