# Chat Image Attachments

Chat accepts local PNG, JPEG, WebP, and GIF images. Users can select, paste, or
drag images into the composer and send text-plus-image or image-only messages.
SVG, arbitrary files, user URLs, `file://` paths, and browser `blob:` URLs are
not accepted by the backend.

## Flow

```text
browser selects image
  -> local blob URL for pending preview only
  -> POST /api/chat/attachments with multipart bytes
  -> backend validates and stores a pending attachment
  -> message request sends only { id, kind: "image" }
  -> provider completes successfully
  -> user message, assistant message, and attachment links commit atomically
```

On provider or persistence failure, the attachment stays pending. The frontend
can delete a pending attachment before send. Sent attachments follow their chat
message lifecycle.

## API

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/api/chat/attachments` | Upload one multipart field named `file` |
| `DELETE` | `/api/chat/attachments/:attachment_id` | Delete an owned pending attachment |
| `GET` | `/api/chat/attachments/:attachment_id/preview` | Return owned validated image bytes |
| `POST` | `/api/chats/:chat_id/messages` | Non-streaming send with attachment ids |
| `POST` | `/api/chats/:chat_id/messages/stream` | Streaming send with attachment ids |

Message body:

```json
{
  "content": "What is in this image?",
  "timezone": "Asia/Bangkok",
  "attachments": [{ "id": "uuid", "kind": "image" }]
}
```

`content` may be empty only when at least one attachment exists. Every id must
be unique, pending, image-kind, and owned by the same session/account as the
chat.

Upload and preview responses expose metadata and a backend preview URL, never a
storage path. Preview requests require the owner's session cookie and use
private/no-store caching.

## Validation And Storage

The backend ignores the claimed extension and browser MIME type. It checks magic
bytes, decodes the image, derives the MIME type, and enforces:

- at most 4 images per message
- at most 10 MiB per image
- width and height at most 8192
- at most 20 million pixels

These defaults are configured by `CHAT_ATTACHMENT_MAX_*`. Files are stored
outside the web root under server-generated keys rooted at
`CHAT_ATTACHMENT_UPLOAD_DIR`. The current implementation stores the validated
original bytes; it does not re-encode images or strip metadata.

Pending attachments older than 24 hours are soft-deleted and their files
removed. Cleanup runs at API startup and hourly, in batches, and never targets
linked attachments.

Upload has its own 12-requests-per-minute in-memory rate-limit bucket. Ownership
is checked for upload session resolution, preview, delete, and message linking.

## Provider Boundary

Persisted chat messages remain text plus attachment metadata. Provider-facing
`AiMessage` uses `Text` and `Image` parts. Image bytes are read by the backend
and never supplied as provider payloads by the browser.

- `mock` accepts image parts for deterministic tests.
- `openai` maps validated bytes to backend-generated data URLs in Chat
  Completions content parts.
- LM Studio and xAI reject image messages before chat messages are persisted.
- Anthropic/Claude is unavailable in runtime configuration.

## Frontend Rendering And Sync

Pending images use local previews. Sent images are fetched with credentials,
converted to temporary browser object URLs, and open in the shared preview
dialog. Missing or inaccessible previews show a compact placeholder. Copy
actions copy message text only.

The generic sync layer does not sync image bytes or attachment metadata.
Canonical backend chats still return their attachment metadata; cache-only
cross-device chat copies may therefore show text without the image.

## Ownership

- HTTP handlers and request validation: `apps/api/src/chat/attachments.rs` and
  `apps/api/src/chat/messages.rs`
- Image validation, storage, and cleanup: `apps/api/src/attachments.rs`
- Persistence: `apps/api/src/store/attachments.rs`
- Provider model and OpenAI mapping: `apps/api/src/ai/`
- Composer and rendering: `apps/web/src/features/chat/`
