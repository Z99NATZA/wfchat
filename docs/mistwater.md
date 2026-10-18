# Mistwater

Mistwater is a standalone client-only pond simulation at `/mistwater`. It is
available from the activity bar without login and has no story, quests, room,
chat, reward, persistence, or backend behavior.

## Experience

The route presents a fixed-camera water study without a visible player,
decorative flowers, score HUD, gameplay sidebar, or movement controls. Clicking,
dragging, or touching the pond injects ripples directly into the water field;
ambient impulses keep the surface moving when there is no input.

## Rendering And Ownership

`apps/web/src/pages/MistwaterPage.tsx` composes the shared app shell and owns the
React surface. `apps/web/src/features/mistwater/` owns the Phaser scene, pond
mask, procedural lighting, and water simulation. The route is lazy-loaded, so
Mistwater and Phaser do not add to the initial Chat route module graph.

The scene uses a fixed 1792×896 compact pond world. The versioned
`mistwater-pond-v4.webp` background contains the non-interactive shoreline,
forest, stones, aquatic vegetation, and neutral pond depth. The base water has
no baked caustic mesh or fixed surface highlights; those are runtime effects. It
lives under `apps/web/public/images/mistwater/`.

`apps/web/src/features/mistwater/game/mistwaterMap.ts` defines the cropped water
bounds, editable shoreline polygon, and ambient impulse positions. Pointer
validation and the WebGL water mask share the same shoreline data, so changing
the simulated water boundary does not require regenerating the background.

The camera stays centered on the pond and adjusts zoom to cover the viewport
without changing world-space pointer coordinates. The renderer uses
antialiasing rather than pixel-art sampling so the detailed background remains
smooth while scaled.

On WebGL renderers, Mistwater places a cropped copy of the pond over the static
background and clips it to the shoreline polygon. The same mask contains a
depth-light gradient, two counter-moving underwater caustic layers, and moving
surface highlights. A 96×44 damped height field propagates ambient and pointer
impulses at 30 simulation steps per second. Its slope map refreshes at 20 frames
per second and displaces both the water image and lighting layers, so caustics
and reflections deform with wave energy while the forest remains still. Canvas
renderers show the neutral static background without the WebGL water material.
