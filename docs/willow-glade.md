# Willow Glade

`/willow-glade` opens a guest-accessible woodland walking scene rendered with
Three.js and WebGL2. It contains one bounded map, one traveller, trees, shrubs,
rocks, a bench, and a pond. There is no combat, character statistics, inventory,
multiplayer, or saved progress. Reopening the route returns the traveller to
the starting point.

## Ownership

- [WillowGladePage](../apps/web/src/pages/WillowGladePage.tsx) composes the
  shared app shell, localized place label, and movement instructions.
- [WillowGame](../apps/web/src/features/willow-glade/components/WillowGame.tsx)
  owns texture loading, world lifetime, and loading/retry UI.
- [WillowWorld](../apps/web/src/features/willow-glade/game/WillowWorld.ts) owns
  the WebGL renderer, lighting, camera, input, movement, animation, and disposal.
- [willowMap](../apps/web/src/features/willow-glade/game/willowMap.ts) owns
  map bounds, prop positions, collision clearance, and pathfinding.
- [willowTerrain](../apps/web/src/features/willow-glade/game/willowTerrain.ts)
  owns physical terrain heights, map/world conversion, and camera placement.
- [willowModels](../apps/web/src/features/willow-glade/game/willowModels.ts)
  creates the terrain texture, plants, water, furniture, rocks, and
  articulated traveller directly from geometry and materials.
- [willowTrees](../apps/web/src/features/willow-glade/game/willowTrees.ts) creates
  curved trunks, tapered roots and branches, bark materials, and layered foliage
  clusters. Each canopy provides its geometric bounds for occlusion fading.

The feature imports no other game's code or assets and makes no API or storage
calls. The shared app shell retains its normal authentication and configuration
bootstrap; see [frontend architecture](frontend-architecture.md).

## Movement and view

Click or tap the ground to walk. Raycasting finds the point on the actual
terrain mesh. Bounded A* and segment checks keep the traveller clear of water,
trunks, rocks, shrubs, and the bench, including diagonal corners and character
clearance. Blocked destinations resolve to nearby safe ground.

Focus the game to use WASD or arrow keys. Controls follow screen directions
despite the camera's diagonal heading. Keyboard movement cancels a click route
and can slide along obstacles. Losing focus or hiding the page clears held keys.
App controls retain their normal keyboard behavior.

The perspective camera looks down at 31 degrees above the ground and follows
the traveller. Terrain has physical slopes and a depressed pond basin. Objects
have volume, receive directional light, cast shadows, and occlude one another
through the depth buffer. Foreground canopies become translucent when they cover
the traveller. The camera does not rotate; narrow screens increase its distance.

Cool skylight and warm sunlight illuminate layered green foliage. Trees have
curved, tapered trunks with textured bark relief and roots that follow the
terrain. Irregular rising branches carry curved, intersecting foliage clusters
with painted oak leaves and alpha-cutout edges. They remain fixed in world space
and respond to lighting and depth; they do not turn toward the camera. Branches
remain visible through gaps between clusters. Distant trees use fewer branches and foliage layers,
and fade into atmospheric haze. Original textures and generation prompts live
in [tree materials](../apps/web/public/images/willow-glade/ASSETS.md).
Low grass leaves the trail edges open. There are no flower or butterfly accents.

The traveller turns toward movement and swings its arms and legs. Grass bends
and the pond's highlights move. The reduced-motion preference read when mounting
freezes ambient animation while retaining necessary character motion.

## Runtime and limits

Rendering is capped at 30 frames per second and device pixel ratio at 1.5.
Grass uses instancing, tree geometry is merged, and
simplified opaque canopy volumes cast shadows through a 1024-pixel shadow map.
Shadows update only when movement or canopy visibility changes. Simulation time
steps are bounded after frame stalls. Hidden pages skip simulation and drawing.

Both tree textures load before the world is constructed. A texture load failure,
WebGL initialization failure, or context loss shows a localized error with a
retry action. Leaving during loading releases the loaded textures without
creating a late canvas. The two PNG textures total about 5.5 MB before transport
compression and are shared across trees within each world. Retrying disposes the old world and creates a fresh renderer. Unmounting
stops the animation loop, disconnects resize observation, removes listeners,
disposes geometries/materials/textures/shadows, releases the graphics context,
and removes the canvas.

Run focused checks from `apps/web`:

```sh
npx vitest run src/features/willow-glade src/components/navigation/ActivityBar.test.tsx
npx playwright test e2e/willow-glade.spec.ts
```
