# Chat Message Rendering

This document scopes the chat UI work for rendering assistant responses in richer formats without expanding into unrelated chat features.

## Goal

Improve readability of assistant responses by rendering a safe, useful Markdown subset inside the existing chat message timeline.

The first implementation should make long assistant replies easier to scan by supporting:

- paragraphs and line breaks
- headings
- unordered and ordered lists
- bold, italic, and inline code
- links
- blockquotes
- fenced code blocks
- GitHub-flavored Markdown tables

## Current State

- `ChatMessage.text` is the only message content field.
- User and assistant messages are rendered by `ChatMessageList`.
- User messages render as plain text.
- Assistant messages render Markdown through `ChatMessageContent`.
- Assistant message bubbles use a wider layout than user bubbles so tables, lists, and code blocks have more readable space.
- Assistant messages with non-empty text expose a copy action that copies the raw `ChatMessage.text` value.
- Local development and local Docker builds can expose frontend-only Markdown QA fixtures with `/chat?qa=markdown` when `import.meta.env.DEV` is true or `VITE_ENABLE_MARKDOWN_QA=true`.
- SSE streaming appends token text into one optimistic assistant message.
- The message list uses `local-assistant-*` companion messages as active streaming assistant placeholders.
- The backend stores plain text content only. No structured message parts exist yet.

## First Scope

### In Scope

- Add a message-content rendering component under `apps/web/src/features/chat/components`.
- Render Markdown only for assistant messages.
- Keep user messages as plain text.
- Use a Markdown parser/renderer library instead of hand-parsing Markdown.
- Support GitHub-flavored Markdown tables and task-list syntax if the selected library supports it cleanly.
- Style rendered content with semantic app tokens from `docs/theme.md`.
- Keep rendering compatible with streaming text updates. Partial Markdown may look incomplete while streaming, but it must not crash.
- Open links in a new tab with safe `rel` attributes.
- Add a copy button for fenced code blocks only if it can be implemented locally inside the message renderer without adding message-level actions. Current implementation includes a code-block copy button.
- Add focused component tests for supported Markdown shapes and streaming placeholder behavior. Required cases live in `docs/chat-message-rendering-test-cases.md`.
- Update this document when the supported format set changes.

### Out Of Scope

- Message attachments, file uploads, image generation, audio, voice input, and multimodal message parts.
- Tool-call cards, citations, web references, source inspectors, or artifact previews.
- Mermaid diagrams, LaTeX/math rendering, charts, iframes, embeds, or custom HTML blocks.
- Additional assistant message actions such as regenerate, thumbs up/down, edit, branch, or share.
- Prompt-engineering changes that force every model response into a specific format.
- Backend schema changes or database migrations.
- SSE protocol changes.
- Chat mode controls, response-shape controls, quick prompts, search, notification behavior, or details-panel changes.
- Reworking the full chat layout, sidebar, header, composer, avatar bridge, or sync system.

If a future task needs any out-of-scope item, create a separate scoped document or extend this one before implementing.

## Rendering Contract

### User Messages

User messages must render as plain text. Do not interpret user content as Markdown in the first implementation.

Reasons:

- avoids surprising formatting when users type Markdown-like text
- reduces XSS and link-spam risk
- keeps user bubble layout compact

### Assistant Messages

Assistant messages may render Markdown from `ChatMessage.text`.

The renderer must:

- preserve readable paragraph spacing
- constrain content to the assistant bubble width
- allow long code lines and wide tables to scroll horizontally inside the bubble
- avoid page-level horizontal overflow
- avoid nested card-like surfaces inside the message bubble unless needed for code blocks
- use small, compact typography appropriate for chat bubbles
- keep timestamp placement stable

### Raw HTML

Raw HTML in assistant text must not be trusted. The first implementation should either escape raw HTML or rely on a renderer configuration that does not render raw HTML.

Do not add HTML rendering plugins unless there is a separate security review.

### Links

Links should render as ordinary inline links.

Rules:

- external links open with `target="_blank"`
- external links use `rel="noreferrer noopener"`
- link text must wrap inside the bubble
- do not add previews, favicons, unfurl cards, or source panels in this scope

### Code Blocks

Fenced code blocks should render as a distinct code surface inside the assistant bubble.

Minimum behavior:

- preserve whitespace
- use monospace font
- support horizontal scrolling
- show the language label when present

Optional first-scope behavior:

- add a small code-copy icon button
- use lightweight syntax highlighting if dependency cost and styling are reasonable

Do not add:

- runnable code sandboxes
- terminal execution
- file creation controls
- diff viewers

### Tables

Tables should be readable inside assistant bubbles.

Rules:

- wrap the table in an overflow container
- keep cell padding compact
- use app border tokens
- do not make the whole page overflow horizontally

## Component Boundaries

Preferred shape:

```text
ChatMessageList
  -> ChatMessageContent
       -> AssistantMarkdownContent
       -> PlainMessageContent
       -> CodeBlockContent
```

Keep chat state in `useChatSession`. The renderer should receive text and author-like intent only.

Do not move streaming state, API calls, or avatar events into message rendering components.

## Dependencies

Allowed dependency direction:

- Add frontend-only Markdown rendering dependencies in `apps/web/package.json`.
- Keep dependencies out of the Rust API.
- Prefer small, common React-compatible packages.

Recommended candidates:

- `react-markdown` - implemented
- `remark-gfm` - implemented

Syntax highlighting is deferred. Code blocks currently use plain monospace rendering with a language label and copy button.

Build note: adding `react-markdown` and `remark-gfm` increases the frontend bundle enough for Vite to warn that the main chunk is larger than 500 kB after minification. This is accepted for the first implementation; revisit code splitting or lighter rendering if bundle size becomes a product concern.

## Styling Rules

Follow `docs/theme.md`.

Use:

- `text-app-text`
- `text-muted`
- `border-app-border`
- `bg-app-panel/92`
- `bg-app-soft`
- `shadow-soft` only where consistent with existing bubbles

Do not add raw hex colors in chat components.

Assistant Markdown should be compact. Avoid large article-style typography inside chat bubbles.

## Accessibility

- Code-copy buttons must have an `aria-label`.
- Links should be keyboard reachable.
- Do not rely on color alone to identify links or code actions.
- Preserve text selection for assistant content.

## Testing

Detailed automated and manual QA cases live in `docs/chat-message-rendering-test-cases.md`.

Testing rules for this scope:

- keep tests frontend-only unless the implementation changes backend contracts
- keep tests close to the renderer or `ChatMessageList`
- cover every format added in the first implementation
- keep the streaming placeholder behavior covered
- do not add backend tests for a frontend-only rendering change

## Manual QA

Use the checklist and sample messages in `docs/chat-message-rendering-test-cases.md`.

At minimum, manual QA must check:

- desktop and mobile widths
- light and dark themes
- streaming partial Markdown
- table and code block overflow behavior
- raw HTML remains inert

## Completion Criteria

The first chat message rendering iteration is complete when:

- assistant Markdown renders for the supported subset
- user messages remain plain text
- raw HTML does not execute or become live DOM
- code blocks and tables do not break chat layout
- streaming still shows only one assistant loading/message surface
- automated frontend tests cover the required cases in `docs/chat-message-rendering-test-cases.md`
- docs list the final supported formats and explicit non-goals

Current status: implemented for the first chat message rendering iteration.

## Implemented Follow-up Scopes

These follow-up scopes are complete and should be treated as current behavior:

- `feat(web): add assistant message actions` - assistant messages with non-empty text expose a full-message copy action. The action copies the raw `ChatMessage.text` value, not rendered HTML.
- `feat(web): improve assistant bubble layout` - assistant message bubbles are wider than user bubbles and keep table/code overflow inside the bubble instead of creating page-level horizontal overflow.
- `feat(web): add markdown manual QA fixtures` - local dev and local Docker builds can load frontend-only Markdown QA messages from `http://localhost:5173/chat?qa=markdown` with the `Load QA` action.

## Future Work

Potential later scopes:

- full assistant message actions
- full-message copy
- syntax highlighting
- citation/source cards
- attachment rendering
- image message parts
- Mermaid or math rendering
- prompt-level response formatting rules

Do not include these in the first implementation unless this document is updated first.
