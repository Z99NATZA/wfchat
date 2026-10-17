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
- When a map is expected to animate or remain editable, keep mutable scenery,
  atmospheric effects, and water-flow paths as explicit layers or map data
  instead of baking them into the terrain image.
