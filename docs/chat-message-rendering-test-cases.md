# Chat Message Rendering Test Cases

This document defines the required test and QA cases for the first chat message rendering iteration.

Use this file with `docs/chat-message-rendering.md`. The rendering document defines scope and contracts; this document defines concrete examples and expected behavior.

## Test Policy

- Keep tests frontend-only unless the implementation changes backend contracts.
- Prefer component tests close to `ChatMessageContent`, `AssistantMarkdownContent`, or `ChatMessageList`.
- Test behavior, not library internals.
- Use stable queries such as roles, visible text, labels, and DOM structure.
- Do not snapshot large rendered Markdown trees unless a small targeted snapshot is clearly more stable than assertions.
- Add or update tests in the same change that adds a supported message format.

## Required Automated Cases

### 1. User Plain Text

Input author:

```text
user
```

Input text:

```markdown
## Not a heading

- Not a list item

**Not bold**
```

Expected:

- content appears as plain text
- no heading element is rendered
- no list element is rendered
- Markdown markers remain visible or are otherwise treated as text, not formatting

Purpose:

- ensures only assistant messages are interpreted as Markdown

### 2. Assistant Paragraphs

Input author:

```text
companion
```

Input text:

```markdown
First paragraph.

Second paragraph with **bold text** and *italic text*.
```

Expected:

- two readable paragraphs render
- bold and italic text are represented with semantic elements
- timestamp remains outside or visually separate from Markdown content

Purpose:

- validates the default readable assistant response path

### 3. Assistant Headings

Input text:

```markdown
## Plan

Short detail.

### Notes

More detail.
```

Expected:

- headings render with compact chat typography
- heading levels do not use oversized page/article styling
- spacing does not break bubble layout

Purpose:

- prevents assistant answers from becoming a plain wall of text

### 4. Assistant Lists

Input text:

```markdown
Steps:

1. First item
2. Second item
3. Third item

Options:

- Alpha
- Beta
- Gamma
```

Expected:

- ordered list renders as an ordered list
- unordered list renders as an unordered list
- list indentation fits inside the bubble on mobile

Purpose:

- covers the common "1, 2, 3" response shape that motivated this work

### 5. Assistant Blockquote

Input text:

```markdown
> Important note
> with a second line.

Normal text.
```

Expected:

- quote renders as a quote-like block
- quote uses app tokens, not hard-coded colors
- normal text after the quote remains readable

Purpose:

- validates notes, warnings, and quoted context without adding custom cards

### 6. Assistant Links

Input text:

```markdown
Read [the docs](https://example.com/docs) before continuing.
```

Expected:

- link is rendered as an anchor
- link has `target="_blank"`
- link has `rel` containing `noreferrer` and `noopener`
- long link text can wrap without overflowing the bubble

Purpose:

- validates link safety and layout behavior

### 7. Raw HTML Is Not Live DOM

Input text:

```markdown
<script>alert("xss")</script>

<img src=x onerror=alert(1)>

<strong>raw strong</strong>
```

Expected:

- no `script` element is created
- no `img` element is created from raw Markdown HTML
- raw HTML is escaped or shown as text according to renderer behavior
- no event-handler attributes become live DOM

Purpose:

- protects the chat surface from unsafe assistant output

### 8. Inline Code

Input text:

```markdown
Use `npm test` before merging.
```

Expected:

- inline code renders in monospace
- inline code stays inline and wraps when needed
- no full code-block surface is used

Purpose:

- validates command and identifier readability inside normal prose

### 9. Fenced Code Block

Input text:

````markdown
```ts
const value = "hello";
console.log(value);
```
````

Expected:

- code block preserves whitespace
- language label `ts` is visible if the implementation supports labels
- long lines scroll horizontally inside the code surface
- code surface does not create page-level horizontal overflow
- code copy button appears only if implemented in the first scope

Purpose:

- covers the most important structured technical response format

### 10. Wide Code Block

Input text:

````markdown
```text
this-is-a-very-long-line-that-should-not-stretch-the-entire-chat-page-this-is-a-very-long-line-that-should-not-stretch-the-entire-chat-page
```
````

Expected:

- bubble width stays constrained
- code block scrolls horizontally
- page does not scroll horizontally

Purpose:

- catches layout regressions on long generated code or logs

### 11. Table

Input text:

```markdown
| Feature | Status | Notes |
| --- | --- | --- |
| Markdown | Ready | First scope |
| Attachments | Later | Out of scope |
```

Expected:

- table renders as a table
- table is wrapped in a horizontal overflow container
- borders use app tokens
- table does not break bubble or page width

Purpose:

- validates GFM table support

### 12. Wide Table

Input text:

```markdown
| Column A | Column B | Column C | Column D | Column E |
| --- | --- | --- | --- | --- |
| Long value that should remain readable | Another long value | More content | Extra content | Final content |
```

Expected:

- table scrolls inside the bubble
- content remains selectable
- timestamp placement remains stable

Purpose:

- catches desktop/mobile layout overflow regressions

### 13. Task List

Input text:

```markdown
- [x] Done item
- [ ] Pending item
```

Expected:

- if task-list syntax is supported, checkboxes render in a non-interactive or safely disabled form
- if task-list syntax is not supported, it still renders readably as list text
- task-list rendering does not imply todo persistence or app state

Purpose:

- constrains GFM behavior so a renderer does not accidentally become a task feature

### 14. Streaming Empty Assistant Placeholder

Input messages:

```text
user: hello
companion id local-assistant-1: empty text
```

State:

```text
isSending = true
```

Expected:

- one assistant surface is visible
- thinking text appears inside the assistant placeholder
- no second standalone thinking bubble appears

Purpose:

- preserves the existing streaming placeholder fix

### 15. Streaming Partial Markdown

Input messages:

```text
user: hello
companion id local-assistant-1: "## Pla"
```

State:

```text
isSending = true
```

Expected:

- renderer does not throw
- visible content remains readable
- no duplicate thinking bubble appears

Purpose:

- ensures streaming partial Markdown cannot crash the UI

### 16. Streaming Partial Code Fence

Input text:

````markdown
```ts
const value =
````

State:

```text
isSending = true
```

Expected:

- renderer does not throw
- unfinished code fence stays contained inside the assistant bubble
- layout does not jump into page-level overflow

Purpose:

- catches common partial-stream edge cases for code answers

### 17. Mixed Content

Input text:

````markdown
## Summary

Use this order:

1. Install dependencies.
2. Run tests.
3. Review output.

```bash
npm test
```

| Check | Result |
| --- | --- |
| Tests | Passing |

> Keep the change scoped.
````

Expected:

- all supported elements render together
- spacing remains compact
- code block and table stay inside the bubble

Purpose:

- validates real assistant-style responses, not only isolated Markdown fragments

## Optional Automated Cases

Add these if implementation includes the related optional behavior.

### Code Copy Button

Input:

````markdown
```js
console.log("copy me");
```
````

Expected:

- copy button has an accessible label
- clicking copy writes only code text, not backticks or language label
- UI gives lightweight copied feedback if implemented

### Syntax Highlighting

Input:

````markdown
```ts
const enabled: boolean = true;
```
````

Expected:

- highlighting does not use raw hard-coded theme colors unless documented
- highlighted output remains readable in light and dark mode
- unsupported languages fall back to plain code

## Manual QA Checklist

Run manual QA after automated tests pass.

### Desktop

- open chat at normal desktop width
- send or inject a message with headings, lists, code block, and table
- verify message bubble width stays consistent
- verify code and table scroll inside the bubble
- verify no page-level horizontal scroll appears
- verify timestamp remains visible and stable

### Mobile Width

- check a narrow viewport
- verify list indentation is not excessive
- verify table and code block horizontal scrolling works
- verify long link text wraps
- verify copy buttons, if present, do not cover code text

### Theme

- check light mode
- check dark mode
- verify surfaces use app tokens and remain readable over the app background

### Streaming

- use `AI_PROVIDER=mock` or a provider that streams visibly
- send a prompt likely to produce Markdown
- confirm partial Markdown does not crash
- confirm no duplicate thinking bubble appears
- confirm final server-confirmed message still renders correctly after `message_done`

### Security Smoke Check

Use this assistant text:

```markdown
<script>alert("xss")</script>
<img src=x onerror=alert(1)>
```

Expected:

- no alert appears
- no image element executes an error handler
- text is escaped or otherwise inert

## Acceptance Checklist

Before finishing the implementation, verify:

- all required automated cases pass or are explicitly documented as not applicable
- `npm --prefix apps/web test` passes
- `npm --prefix apps/web run build` passes
- no backend tests were added for frontend-only rendering
- docs list the final supported Markdown subset
- any new dependencies are frontend-only and justified in the final implementation summary
