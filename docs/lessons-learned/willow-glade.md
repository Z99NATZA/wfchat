# Willow Glade

Compressing a flat 2D ground plane and sorting upright sprites by foot position
still reads as a top-down game. It cannot produce physical terrain relief,
object side faces, perspective foreshortening, or geometric lighting. For an
oblique world with visible volume, use actual geometry with a low perspective
camera, terrain raycasting, depth-buffer occlusion, and shadows. Inspect the
first rendered frame as well as movement; foreground foliage can hide the
traveller before the occlusion fade runs.

Repeated horizontal branch tiers and flat diamond leaves produce a mechanical,
placeholder appearance even at high leaf counts. Irregular rising forks and
curved clusters with painted leaf silhouettes provide finer detail at a lower
geometry cost. Inspect a nearby tree as well as the wide scene: distant foliage
can hide sharp leaf facets and stretched bark UVs. Alpha-tested foliage needs a
lower cutoff while fading, otherwise the reduced opacity discards the entire
canopy instead of making it translucent.
