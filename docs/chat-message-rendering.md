# Chat Message Rendering

`ChatMessage.text` is the canonical text field. User and assistant content use
different rendering rules inside `ChatMessageContent`.

## Rendering Contract

User messages render as plain text. Image attachments render as authenticated
thumbnails beside that text; see [Chat image attachments](chat-image-attachments.md).

Assistant messages render with `react-markdown` and `remark-gfm`:

- paragraphs, headings, emphasis, and blockquotes
- ordered, unordered, and task lists
- links
- inline code and fenced code blocks
- GitHub-flavored Markdown tables

Raw HTML stays inert because no raw-HTML plugin is enabled. External links open
in a new tab with `noopener noreferrer`. Tables and code blocks scroll inside
the assistant bubble and must not create page-level horizontal overflow.

Assistant messages with non-empty text expose a full-message copy action. Fenced
code blocks also expose a code-only copy action and show the language label when
present.

## Syntax Highlighting

Fenced code renders immediately as plain monospace text. Eligible, finalized
blocks are highlighted asynchronously with Shiki; inline code stays plain.

The highlighter:

- loads core, themes, and grammars through fine-grained dynamic imports
- skips active streaming content
- debounces changing code, caches by code/language/theme, and limits input size
- renders token spans through React rather than `dangerouslySetInnerHTML`
- preserves code-block dimensions before and after highlighting

Supported grammar aliases currently cover shell, CSS, diff, Go, HTML,
JavaScript/JSX, JSON, Markdown, Python, Rust, SQL, TypeScript/TSX, and YAML.
Unknown languages keep the plain code fallback.

Markdown dependencies build into the `markdown-renderer` Vite chunk. Do not
collapse Shiki's dynamic imports into one large manual chunk.

## Streaming And Layout

SSE tokens append to one `local-assistant-*` optimistic message. An empty
placeholder shows the thinking state inside that bubble; the list must not add a
second standalone thinking bubble.

Assistant bubbles are wider than user bubbles. The virtualized message list
supports variable heights and remounts, so render effects, observers, and timers
must clean up on unmount.

## Boundaries

- Rendering components receive content and UI intent only; they do not own chat
  state, API calls, streaming, or avatar events.
- User text is never interpreted as Markdown.
- Unsupported content includes live HTML, Mermaid, math, iframes, embeds,
  runnable code, citations/source cards, and tool-call cards.
- Use semantic theme tokens and preserve keyboard access, text selection, and
  accessible labels for copy actions.

## Verification

Focused tests live beside `ChatMessageContent`, `ChatMessageList`, and
`codeHighlighter`. They cover supported Markdown, inert HTML, safe links,
overflow containers, streaming placeholders, copy behavior, lazy highlighting,
cache reuse, size limits, themes, and virtualized remounts.

For visual QA, enable `VITE_ENABLE_MARKDOWN_QA=true` and open
`/chat?qa=markdown`. Check desktop/mobile widths, light/dark themes, partial
streaming Markdown, and table/code overflow.
