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
must not trigger document scrolling. The Cafe movement pad and action button
share a bottom control zone. Reactions, room chat, dialogue, and top status
overlays must not overlap that zone or one another at the supported narrow
viewport. The mobile activity HUD keeps progress visible but moves detailed
active-round guidance behind its Help action. The room-chat icon stays at its
fixed control position and toggles the panel open or closed.

Persistent UI inside the Cafe game surface—including activity and room status,
movement and interaction controls, chat, Aiko dialogue, and reactions—uses the
Cafe palette. Application chrome and interruption UI retain the application
theme.

On small screens, the shared application header temporarily moves above
feature-owned overlays while its overflow menu is open. Closing the menu
restores the header's normal layer so feature controls keep their expected
stacking and interaction behavior.

The Cafe game surface disables text selection and native touch callouts to
prevent long presses from opening browser UI. Its room-chat panel restores
selection so messages can be copied and the input remains editable.

## Verification

Check mobile and desktop widths with browser chrome expanded/collapsed and the
virtual keyboard opened/closed:

- the document does not scroll
- the feature timeline does scroll
- header, composer, and Cafe controls remain reachable
- the Cafe lobby headline wraps into balanced lines
- Cafe lobby form controls retain their full touch-target height
- send completion does not reopen the mobile keyboard
- the latest message is not covered by the PNGTuber

Run frontend tests and the production build after layout changes.
