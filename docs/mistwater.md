# Mistwater

Mistwater is a standalone client-only pond simulation at `/mistwater`. It is
available from the activity bar without login and has no story, quests, room,
chat, reward, persistence, or backend behavior.

## Experience

The route presents a fixed-camera water study without a visible player,
decorative flowers, score HUD, gameplay sidebar, or movement controls. Clicking,
dragging, or touching the pond injects ripples directly into the water field;
low-amplitude directional waves keep the surface moving when there is no input.

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
bounds and editable shoreline polygon. Pointer validation and the WebGL water
mask share the same shoreline data, so changing the simulated water boundary
does not require regenerating the background.

The camera stays centered on the pond and adjusts zoom to cover the viewport
without changing world-space pointer coordinates. The renderer uses
antialiasing rather than pixel-art sampling so the detailed background remains
smooth while scaled.

On WebGL renderers, Mistwater places a cropped copy of the pond over the static
background and clips it to the shoreline polygon. The same mask contains a
depth-light gradient, refractive caustics, and clustered surface highlights.
The caustic light map is generated at runtime from an analytic spectrum of
gravity and capillary waves. Surface second derivatives form a refractive
Jacobian; its compression focuses light into irregular branches whose size,
thickness, and brightness change continuously. Optical softening keeps the
bright folds finite, while depth attenuation makes them weaker in deeper water.

A 96×44 damped height field propagates pointer impulses at 30 simulation steps
per second. Its bilinearly sampled curvature feeds the optical field, so
interactive ripples alter both refraction and focused light. At idle, three
low-amplitude analytic wave normals move continuously across the displacement
map instead of point impacts, avoiding rain-like rings. The slope map encodes
horizontal and vertical gradients separately; the displacement and 256×128
caustic maps refresh at 20 frames per second. The forest remains still. Canvas
renderers show the neutral static background without the WebGL water material.
