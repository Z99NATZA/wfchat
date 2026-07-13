# Chat Layout Scroll Behavior

This document defines the current scroll behavior for the chat screen in `apps/web`.

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
- Switching the active chat is a navigation boundary. The newly selected chat should reset transient timeline state and scroll directly to the latest loaded message, even if the user had scrolled upward in the previous chat.
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
- Reset measured heights and transient list UI state when the active chat changes so the previous chat's virtualized scroll state cannot pin the next chat away from its latest message.
- Keep the existing bottom auto-scroll and `Jump to latest` behavior.
- Keep PNGTuber bottom clearance as part of the timeline's bottom spacing contract.
- Unmounted messages must not keep expensive rendering work, highlight effects, observers, or timers alive.

Performance constraints:

- Streaming assistant messages can trigger frequent `ResizeObserver` callbacks,
  height state updates, and offset recalculation. Unchanged-height guards prevent
  redundant measurement updates.
- Hot measurement paths use id-indexed lookup rather than repeated linear
  message searches.
- Height changes rebuild virtual offset arrays through memoized row metrics.

Current automated coverage:

- Long conversations mount only the virtualized window.
- Incoming messages do not pull the viewport back to the latest message after
  the user scrolls upward near the bottom.
- Switching chats resets the timeline and scrolls to the latest message in the
  newly selected chat.
- Overlay clearance reserves bottom space in the timeline.

## Why This Matters

- Removes double-scroll UX (browser page + message list).
- Keeps controls reachable on long chats.
- Matches common chat app expectations on desktop and mobile.
- Keeps long Markdown/code-heavy conversations responsive when combined with lazy code highlighting.
