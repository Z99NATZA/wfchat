# Chat Layout Scroll Behavior

This document defines the intended scroll behavior for the chat screen in `apps/web`.

## Goals

- Prevent page-level scrolling during normal chat usage.
- Keep chat context stable by pinning the top and bottom action areas.
- Allow long conversations without shifting the full app shell.

## Layout Contract

- The app shell uses the dynamic viewport contract from `docs/mobile-viewport.md` with `overflow-hidden`.
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

## Virtualized Timeline

Long chat timelines use list virtualization/windowing so the UI keeps only messages near the viewport mounted. This is a UI rendering optimization only; message data and backend AI context management are separate concerns.

Current behavior:

- The scrollbar must represent the loaded chat timeline, not only the currently mounted viewport items.
- Header and composer stay outside the virtualized list.
- Render only visible messages plus a modest overscan region.
- Use stable message ids as item keys.
- Support variable message heights for Markdown, tables, code blocks, and streaming text.
- Cache measured message heights by message id.
- Preserve scroll position when older messages are prepended.
- Keep the existing bottom auto-scroll and `Jump to latest` behavior.
- Keep PNGTuber bottom clearance as part of the timeline's bottom spacing contract.
- Unmounted messages must not keep expensive rendering work, highlight effects, observers, or timers alive.

Known performance risks to revisit:

- Streaming assistant messages can trigger frequent `ResizeObserver` callbacks, height state updates, and offset recalculation. Keep unchanged-height guards, and consider `requestAnimationFrame` batching if streaming causes scroll jitter or CPU spikes.
- Large histories can make per-row lookup costs visible. Avoid repeated O(n) lookups in hot measurement paths; prefer id-indexed maps when profiling shows pressure.
- Height changes currently rebuild virtual offset arrays through memoized row metrics. Measure rebuild frequency under long conversations and streaming, then consider batched or incremental offset updates if needed.
- History prepend must preserve the user's anchored viewport. Any future older-message loading flow should verify `scrollTop` compensation against the scroll-height delta.

Planned test and QA coverage:

- long conversations render only visible messages plus overscan, while the scrollbar still represents the loaded timeline
- bottom auto-scroll still occurs only when the user is near the latest message
- incoming messages do not force-jump the viewport when the user is reading history
- `Jump to latest` remains visible and returns to the latest message when the user is away from the bottom
- prepending older messages preserves the user's anchored viewport position
- variable-height Markdown, tables, code blocks, and streaming text are measured without page-level scroll regressions
- PNGTuber overlay clearance still prevents the latest visible bubble from sitting under the overlay
- unmounted messages do not keep highlight work, resize observers, timers, or other expensive effects alive
- mobile-width chat keeps the composer reachable and does not reintroduce body/page scrolling

## Why This Matters

- Removes double-scroll UX (browser page + message list).
- Keeps controls reachable on long chats.
- Matches common chat app expectations on desktop and mobile.
- Keeps long Markdown/code-heavy conversations responsive when combined with lazy code highlighting.
