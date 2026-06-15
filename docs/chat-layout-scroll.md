# Chat Layout Scroll Behavior

This document defines the intended scroll behavior for the chat screen in `apps/web`.

## Goals

- Prevent page-level scrolling during normal chat usage.
- Keep chat context stable by pinning the top and bottom action areas.
- Allow long conversations without shifting the full app shell.

## Layout Contract

- The app shell uses a fixed viewport height container (`h-screen`) with `overflow-hidden`.
- The page body/root is also fixed to full height (`html`, `body`, `#root` set to `height: 100%`).
- The chat message timeline is the primary scroll container (`overflow-y-auto`).

## Sticky Regions

- Header (`ChatHeader`) stays pinned at top of the main chat column.
- Composer (`ChatComposer`) stays pinned at bottom of the main chat column.
- Sidebar and details panel manage their own internal overflow where needed.
- When the chat PNGTuber overlay is visible, `ChatPage` measures the composer height to position the overlay above the composer.
- The message timeline reserves bottom clearance for the measured overlay height plus a small gap. It does not add composer height to that clearance because the timeline is already laid out above the composer.

## Auto-Scroll Rule

- New assistant/user messages should auto-scroll only when the user is already near the bottom.
- If the user scrolls up to read history, incoming messages must not force-jump the viewport.
- When the user is away from the bottom, show a `Jump to latest` action at the bottom-right corner.
- While the user stays away from the bottom, show a badge on the action with the count of newly arrived messages.

## Why This Matters

- Removes double-scroll UX (browser page + message list).
- Keeps controls reachable on long chats.
- Matches common chat app expectations on desktop and mobile.
