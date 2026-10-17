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
  Mistwater keeps gameplay flowers, atmosphere, and water-flow paths separate
  while the non-interactive forest and shoreline share one rendered backdrop.
