# Mistwater

## 2026-10-17 - Flattened nature map blocked animation and editing

Context:

- A top-down nature map needed flowing water, moving atmosphere, and scenery
  that could be repositioned during later design work.

Failed approach:

- Terrain, water, shorelines, trees, rocks, reeds, bridges, and mist were baked
  into one raster background.

Problem observed:

- Water motion could not follow shoreline boundaries reliably, scenery could
  not be moved independently, and foreground occlusion could not be adjusted
  without replacing the whole image.

Root cause:

- Flattening the map discarded the semantic boundaries and object positions
  required by animation and rendering order.

Lesson:

- A cohesive static environment may be baked into one background, but anything
  expected to animate or move must remain an explicit layer or map datum.
  Mistwater keeps the runtime water material and wave boundary separate while
  the non-interactive forest and shoreline share one rendered backdrop.

## 2026-10-18 - Overlay motion did not make the pond surface move

Context:

- The realistic pond already had current streaks, glints, eddies, and ripple
  outlines layered over a detailed water texture.

Failed approach:

- Treating those moving overlays as a substitute for deformation of the water
  image itself.

Problem observed:

- The effects moved, but reflections, highlights, submerged stones, and the
  base water pattern stayed fixed, so the pond still read as a static picture.

Root cause:

- No effect changed the sampled pixels of the pond texture or propagated an
  impulse through neighboring water regions.

Lesson:

- Use overlays for readable flow direction, but pair them with a shoreline-
  masked displacement layer driven by a damped wave field when the underlying
  water surface must appear physically alive.

## 2026-10-18 - Baked caustics competed with runtime lighting

Context:

- The pond used a painterly background with strong cyan caustics and white
  reflection bands already rendered into the water.

Failed approach:

- Adding moving procedural light over the fully lit background.

Problem observed:

- Runtime light moved, but the dominant painted highlights remained fixed, so
  the combined surface still appeared static.

Root cause:

- The base color and runtime lighting represented the same optical detail, but
  only one of those layers responded to the wave simulation.

Lesson:

- Keep the pond base limited to depth, color, and submerged detail. Generate
  caustics and surface highlights at runtime, clip them to the shoreline, and
  displace them with the same height field as the water image.
