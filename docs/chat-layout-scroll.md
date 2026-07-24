# Chat Layout And Scrolling

The chat column has one scrolling region: the virtualized message timeline.
The page/body, header, and composer do not scroll during normal chat use.

## Layout

- The app shell follows [Mobile viewport](mobile-viewport.md) and hides overflow.
- Header stays above the timeline; composer stays below it.
- Sidebar and details panel own their internal overflow.
- A visible PNGTuber sits above the measured composer.
- Timeline bottom spacing includes the measured overlay height plus a gap, not
  composer height.

## Auto-Scroll

- New content follows the bottom only while the user is already near it, except
  that starting a user send always brings the new turn into view.
- Scrolling upward disables forced following and shows `Jump to latest` with a
  new-message count.
- Changing the active chat resets transient list state and scrolls the new chat
  directly to its latest message.
- Layout-driven height growth while restoring a chat keeps following the bottom;
  only upward movement backed by wheel, touch/pointer, scrollbar, or keyboard
  input disables the pending alignment.

## Virtualization

`ChatMessageList` mounts visible rows plus overscan and supports variable
heights for text, images, Markdown, tables, code, and streaming updates.
Stable message ids key cached measurements.

Changing chats clears measurements and observers. Unmounted rows must release
highlighting effects, timers, and observers. Streaming resize handling avoids
unchanged-height updates and uses id-indexed lookup plus memoized offset data.

Tests cover long-list windowing, scroll-up preservation, chat switching,
streaming growth, and overlay clearance.
