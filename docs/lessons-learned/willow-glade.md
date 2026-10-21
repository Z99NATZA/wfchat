# Willow Glade

Compressing a flat 2D ground plane and sorting upright sprites by foot position
still reads as a top-down game. It cannot produce physical terrain relief,
object side faces, perspective foreshortening, or geometric lighting. For an
oblique world with visible volume, use actual geometry with a low perspective
camera, terrain raycasting, depth-buffer occlusion, and shadows. Inspect the
first rendered frame as well as movement; foreground foliage can hide the
traveller before the occlusion fade runs.
