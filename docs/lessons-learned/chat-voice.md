# Chat Voice Lessons Learned

## 2026-07-03 - Unsupported model parameters broke speech translation

Context:
- Speech playback could derive provider text through the configured chat model.

Failed approach:
- The translation request always sent a custom `temperature` value.

Problem observed:
- Models that rejected custom temperature failed before voice synthesis began.

Root cause:
- A provider request option was assumed to be supported by every configured
  model.

Lesson:
- Do not apply optional generation parameters uniformly across models without
  checking their supported request contract.

## 2026-06-28 - Recording feedback changed composer height

Context:
- Push-to-talk needed visible recording status and a cancel action.

Failed approach:
- Recording state introduced a separate status row below the normal composer.

Problem observed:
- Starting and stopping recording shifted the composer and chat timeline.

Root cause:
- Transient feedback changed the layout contract instead of fitting within its
  reserved surface.

Lesson:
- Do not let transient voice state add or remove composer rows during an active
  interaction.

## 2026-06-27 - Voice actions continued across conflicting chat actions

Context:
- Assistant playback, microphone recording, sending, clearing, and chat
  navigation could occur close together.

Failed approach:
- Playback and transcription lifecycles were allowed to continue independently
  after a conflicting foreground action began.

Problem observed:
- Audio could overlap microphone input, and delayed transcription could modify
  the wrong draft or chat.

Root cause:
- Voice resources were not owned by the current foreground chat action.

Lesson:
- Do not allow voice playback or capture to survive an action that changes its
  chat or input context.

## 2026-06-26 - Successful HTTP audio responses could contain silence

Context:
- A speech engine returned successful query and synthesis responses.

Failed approach:
- HTTP success and valid WAV structure were treated as proof of usable speech.

Problem observed:
- Unsupported input produced silent audio that the UI treated as successful
  playback.

Root cause:
- Transport validity was confused with semantic audio validity.

Lesson:
- Do not treat a successful speech HTTP response as usable audio without
  validating that it contains speakable output.

## 2026-06-25 - Default MediaSource streaming failed on first playback

Context:
- Uncached speech attempted to reduce time to first audio.

Failed approach:
- Browser `MediaSource` streaming was used as the default playback path.

Problem observed:
- The first speaker action in a session could fetch valid audio but fail before
  audible playback because of browser lifecycle and activation timing.

Root cause:
- A capability-sensitive optimization was treated as a reliable baseline.

Lesson:
- Do not make browser-dependent streaming media behavior the default until its
  first-use lifecycle is reliable across supported browsers.

## 2026-06-25 - Waiting for the fetch response lost user activation

Context:
- Streaming audio playback needed a user gesture to start reliably.

Failed approach:
- Playback setup waited for the network response before creating and starting
  the media element.

Problem observed:
- Browser user activation expired before playback began, especially on the first
  response in a newly created chat.

Root cause:
- Gesture-gated playback was initialized outside the gesture lifetime.

Lesson:
- Do not defer gesture-gated media initialization until after an awaited network
  boundary.

## 2026-06-25 - Full-response buffering delayed uncached speech

Context:
- Real provider speech responses could be large enough to arrive gradually.

Failed approach:
- The entire audio body was buffered into a Blob before playback could start.

Problem observed:
- Users heard no audio until the complete response downloaded.

Root cause:
- The playback path coupled start time to full-body completion.

Lesson:
- Do not require full-response buffering when latency-sensitive playback is the
  intended interaction.

## 2026-06-21 - Cleanup errors overwrote successful playback

Context:
- Playback state was cleaned after the audio `ended` event.

Failed approach:
- The completed playback token remained active while cleanup ran.

Problem observed:
- A cleanup-side error could replace a successful completion with a visible
  retry or failure state.

Root cause:
- Completion was not finalized before non-critical cleanup began.

Lesson:
- Do not let cleanup failure retroactively change an already successful user
  outcome.
