# Mistwater

Mistwater is a standalone client-only pond simulation at `/mistwater`. It is
available from the activity bar without login and has no story, quests, room,
chat, reward, persistence, or backend behavior.

## Experience

The route presents a fixed-camera living forest and pond without a visible
player, decorative flowers, score HUD, gameplay sidebar, or movement controls.
Clicking, dragging, or touching the pond injects ripples directly into the
water field; low-amplitude directional waves keep the surface moving when there
is no input.

## Rendering And Ownership

`apps/web/src/pages/MistwaterPage.tsx` composes the shared app shell and owns the
React surface. `apps/web/src/features/mistwater/` owns the Phaser scene, pond
mask, procedural lighting, forest atmosphere, and water simulation. The route
is lazy-loaded, so Mistwater and Phaser do not add to the initial Chat route
module graph.

The scene uses a 2688×1344 modular forest world, 2.25 times the area of the
former compact pond world. A repeatable forest-floor tile fills the world; a
transparent pond-rim layer preserves only the pond, shoreline, and nearby
scenery from the painted source. The base water has no baked caustic mesh or
fixed surface highlights; those are runtime effects. Tree trunks, crowns,
branches, and understory are separate transparent assets under
`apps/web/public/images/mistwater/` rather than pixels flattened into the
terrain.

`apps/web/src/features/mistwater/game/mistwaterMap.ts` defines the cropped water
bounds, editable shoreline polygon, independent tree objects, isolated foliage
anchors, and falling-leaf source areas. Each tree entry owns its position,
scale, orientation, tint, crown attachment, and wind response. Adding, removing,
or moving an entry does not redraw the terrain or pond; the world also exposes
`addTree`, `removeTree`, and `moveTree` for runtime editing. Pointer validation
and the WebGL water mask share the shoreline data, so changing the simulated
water boundary does not require regenerating the background. Expanding the
world dimensions extends the tiled ground while object positions remain
world-space data.

The camera stays centered on the expanded world and adjusts zoom to cover the
viewport without changing world-space pointer coordinates. The lower zoom
bound accommodates the larger map. The renderer uses antialiasing rather than
pixel-art sampling so the detailed background remains smooth while scaled.

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
caustic maps refresh at 20 frames per second.

The forest uses a hybrid render rather than synthesizing detailed trees from
first principles. Painted modular assets preserve bark, moss, leaf, and root
detail, while placement and motion remain data-driven. Each tree has a rigid,
stationary trunk and a separate crown that bends and compresses subtly around a
fixed attachment point. Transparent branch and understory sprites use the same
fixed-anchor rule. A seeded wind field keeps a low ambient flow and introduces
smooth intermittent gusts, with foreground leaf tips moving more than distant
foliage.

Moving dappled light combines advected multi-scale value noise with
Beer–Lambert optical attenuation, so dense virtual canopy transmits less light
than gaps. A paired low-opacity multiply layer moves transmitted canopy shadows
with the same field. Sparse leaves use the local wind with aerodynamic drag,
downward acceleration, flutter, and chlorophyll-to-carotenoid color variation.
Both light maps exclude the pond so they do not compete with the water optics.
Canvas renderers retain isolated foliage, procedural land light, and leaves but
omit the WebGL water material.
