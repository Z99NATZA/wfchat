# Mobile Viewport And Safe Area

The application is a fixed full-height shell. Normal page scrolling is disabled;
each feature owns its internal scroll region.

## Contract

`styles.css` defines `.app-viewport` with progressive height fallbacks:

```css
height: 100vh;
height: 100svh;
height: 100dvh;
```

`html`, `body`, and `#root` use full height, and `body` uses
`overflow: hidden`. `AppLayout` and full-screen route loading states use
`.app-viewport`.

The chat timeline uses `overflow-y-auto`; header and composer remain outside
that scroll container. The composer adds its normal bottom padding plus
`env(safe-area-inset-bottom)`.

## Focus

Desktop-like viewports may refocus the textarea after send completion. Mobile
width or coarse-pointer devices must not programmatically refocus after send or
assistant completion because that reopens the virtual keyboard. Explicit user
actions such as tapping a quick prompt may focus it.

## Overlay And Cafe Controls

`ChatPage` measures the composer to position the PNGTuber above it, then
reserves the measured overlay height—not composer height—in the timeline.

Cafe touch controls stay inside the game surface above the bottom safe area and
must not trigger document scrolling.

## Verification

Check mobile and desktop widths with browser chrome expanded/collapsed and the
virtual keyboard opened/closed:

- the document does not scroll
- the feature timeline does scroll
- header, composer, and Cafe controls remain reachable
- send completion does not reopen the mobile keyboard
- the latest message is not covered by the PNGTuber

Run frontend tests and the production build after layout changes.
