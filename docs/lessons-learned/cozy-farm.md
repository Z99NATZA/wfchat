# Cozy Farm renderer initialization under CSP

PixiJS 8's default renderer checks dynamic function evaluation during startup.
The nginx document CSP forbids it, so the initial game worked through Vite but
failed before creating a canvas in the Docker-served bundle. The generic WebGL
error message obscured the cause.

Import `pixi.js/unsafe-eval` before initializing the renderer. Despite its name,
this entry point installs static shader and uniform implementations that avoid
dynamic evaluation. Keep the nginx policy intact. Log initialization failures
and use a generic reload message rather than assuming WebGL is unavailable.

`apps/web/playwright.cozy-farm.config.ts` builds the production bundle with the
same-origin API configuration used by Docker. The browser test applies the
checked-in nginx CSP to document responses and exercises the playable scene.
A Vite-only browser test does not cover this deployment boundary.

## Character anatomy across animation frames

Cropping every upper-body pose at a fixed Y and attaching a separate leg rig
produced visible waist seams, detached thighs and angular knees. The authored
sprites change pelvis position and torso lean between poses, while the rig
assumed fixed hip coordinates. Small skin-strip textures stretched along bones
also lost the original knee and boot detail.

Render each registered character frame as one complete sprite. Preserve
the measured ground baseline and advance the full-body poses with actual travel.
A passing collision or playback test cannot establish visual anatomy: inspect
complete walk/run cycles in all four directions at gameplay and enlarged scale.

## Sprite playback is not proof of stepping

The first full-body sheets contained many repeated contact silhouettes. Although
all frame indices advanced, the legs looked stuck while the upper body changed.
Replacing the split-body rig fixed anatomy but did not fix the source gait.

Verify lower-body pixels independently of the torso. Review complete cycles in
all four directions alongside frame-by-frame inspection. Character browser
checks require distinct lower-body artwork, planted idle feet and consistent
head/foot registration; changing frame numbers alone cannot establish a gait.
