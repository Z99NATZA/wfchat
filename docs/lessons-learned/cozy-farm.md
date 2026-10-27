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
