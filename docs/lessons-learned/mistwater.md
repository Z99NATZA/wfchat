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
  Mistwater keeps the ground tile, pond rim, runtime water material, tree
  trunks, crowns, foliage, and wave boundary as separate layers or data.

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

## 2026-10-18 - Periodic contour caustics looked synthetic

Context:

- The neutral pond base exposed the shape and repetition of every procedural
  lighting layer.

Failed approach:

- Building caustics from several periodic sine contours and encoding both wave
  slopes into one displacement value.

Problem observed:

- The light formed long repeating loops across the pond, while wave refraction
  favored a shared diagonal direction.

Root cause:

- Periodic contours lacked irregular cell boundaries, and one displacement
  channel could not preserve independent horizontal and vertical surface
  gradients.

Lesson:

- Derive the light field from surface curvature rather than drawing periodic
  contours. Encode horizontal slope in red and vertical slope in green so
  displacement follows the local wave normal instead of a shared direction.

## 2026-10-18 - Complete cellular outlines looked like scales

Context:

- Cellular distance fields replaced the pond's repeating sine contours.

Failed approach:

- Drawing every Voronoi boundary with nearly the same opacity across the full
  water surface.

Problem observed:

- The dense, uniformly lit polygons read as a net or reptile scales instead of
  intermittent focused light.

Root cause:

- Geometric irregularity alone did not create the sparse, high-contrast energy
  distribution of natural caustics.

Lesson:

- Do not trace arbitrary geometry to imitate caustics. Combine differently
  directed gravity and capillary waves, calculate the refractive mapping
  Jacobian, and turn its compression into finite focused light. This produces
  changing branches and varied energy without revealing a repeated cell mesh.

## 2026-10-18 - Automatic point impulses looked like rainfall

Context:

- The pond needed to remain alive while the user was not interacting with it.

Failed approach:

- Periodically injecting small disturbances at different points across the
  pond.

Problem observed:

- Each disturbance expanded as a circular front, so the calm forest pond read
  as though droplets were continually striking its surface.

Root cause:

- A point impulse is physically equivalent to a local impact even when its
  amplitude is subtle.

Lesson:

- Reserve point impulses for direct pointer interaction. Drive idle motion with
  low-amplitude directional wave normals that cross the surface continuously
  without creating impact centers or concentric rings.

## 2026-10-18 - Animated overlays did not increase map scale

Context:

- The pond scene needed to grow into a wider forest while keeping the existing
  natural water as its visual anchor.

Failed approach:

- Adding wind, transmitted light, and leaves to canopy crops from the same
  compact 1792×896 background.

Problem observed:

- The forest moved, but the pond still occupied the same composition and no new
  terrain existed, so the map did not feel broader.

Root cause:

- Runtime animation changes time, not spatial extent. The world dimensions and
  source artwork still described the original compact pond.

Lesson:

- Expand the base terrain and world coordinates first, then remap the shoreline,
  camera, canopy regions, and particle sources before layering animation over
  the larger environment.

## 2026-10-18 - Large canopy crops made the ground drift

Context:

- The expanded forest needed visible wind movement without reducing the
  realism of its terrain.

Failed approach:

- Cropping large rectangular regions from the flattened background and moving
  them behind soft masks.

Problem observed:

- The crops contained rocks, roots, trunks, and forest floor in addition to
  leaves. Their motion made the land appear to slide instead of making the
  vegetation appear alive.

Root cause:

- A feathered edge hides a crop boundary but cannot separate rigid terrain from
  flexible foliage inside the crop.

Lesson:

- Keep the background completely stationary. Animate only alpha-isolated
  branches and understory around fixed attachment points, and represent moving
  light separately from geometric motion.
