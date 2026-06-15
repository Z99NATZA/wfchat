# Mobile Viewport And Safe Area

This document scopes the mobile browser viewport work for the web app shell and chat screen.

## Problem

Mobile browsers such as Chrome and Safari have dynamic browser chrome. Address bars, bottom toolbars, and gesture areas can change the available viewport height while the page is open.

If the app shell uses static `100vh`/`h-screen` behavior, the browser can report a height that includes UI chrome. The result is:

- app content appears pushed downward
- the chat composer can be clipped by the bottom browser UI
- the body/page can scroll in addition to the chat timeline
- sticky chat regions feel unstable when the browser chrome expands or collapses

## Goal

Make the app shell use the visible mobile viewport reliably while preserving the existing chat layout contract:

- one full-height app shell
- no normal page-level scroll
- chat message timeline remains the primary scroll container
- chat header and composer remain reachable
- composer respects device safe-area insets

## In Scope

- Add or update a shared app-shell viewport CSS utility for `100dvh` with sensible fallbacks.
- Replace `h-screen` usage in the primary app shell with the viewport utility.
- Keep `html`, `body`, and `#root` locked to full height.
- Prevent normal page-level scrolling for the app shell.
- Add bottom safe-area padding to the chat composer shell.
- Preserve the existing single-scroll message timeline behavior.
- Preserve PNGTuber overlay positioning and message-list bottom clearance behavior.
- Update focused docs after implementation.

## Out Of Scope

- Redesigning the chat UI, sidebar, message bubbles, composer controls, or PNGTuber overlay visuals.
- Changing route structure, navigation, auth, sync, backend APIs, or chat message contracts.
- Adding PWA install behavior, fullscreen mode, viewport meta changes beyond what is already present, or native app wrappers.
- Changing desktop layout except where the shared viewport utility naturally replaces `h-screen`.
- Adding browser-specific JavaScript resize hacks unless CSS dynamic viewport units are insufficient.

## Layout Contract

The app shell should prefer dynamic viewport units in this order:

```css
height: 100vh;
height: 100svh;
height: 100dvh;
```

Use `100dvh` as the final value so the app follows the currently visible viewport when mobile browser chrome changes. Keep `100svh` and `100vh` as fallbacks.

The shell should keep:

```text
overflow: hidden
```

The chat timeline should remain:

```text
overflow-y-auto
```

Do not move scrolling back to `body`, `main`, or the browser page.

## Safe Area Contract

The chat composer sits at the bottom of the chat column and must avoid device safe areas.

The composer bottom padding should include:

```css
env(safe-area-inset-bottom)
```

Use a base padding plus the safe-area inset. Do not add a fixed large mobile-only spacer unless there is a measured layout reason.

The header does not need extra browser-chrome compensation for normal browser tabs. If a later PWA/fullscreen scope needs top safe-area support, document it separately.

## PNGTuber Overlay Interaction

Keep the current overlay rules:

- `ChatPage` measures the composer height to position the PNGTuber overlay above the composer.
- `ChatPage` measures the overlay height to reserve bottom clearance in the message timeline.
- Message timeline clearance should not include composer height because the timeline is already laid out above the composer.

Mobile viewport changes must not reintroduce overlay overlap with the composer or chat bubbles.

## Testing

At minimum:

- run frontend tests
- run web production build
- manually check mobile-width behavior in browser devtools or a real mobile browser when available

Manual checks:

- page itself does not scroll during normal chat use
- message timeline scrolls
- composer remains visible when browser chrome is expanded
- composer remains visible after focusing and blurring the textarea
- latest bubble does not sit under the PNGTuber overlay
- behavior remains acceptable on desktop width

## Completion Criteria

This scope is complete when:

- app shell height follows mobile visible viewport more reliably than static `h-screen`
- composer is not clipped by mobile browser UI or safe-area inset
- chat timeline remains the only normal scroll container
- PNGTuber overlay and message bottom clearance still work
- docs reflect the final viewport and safe-area contract
