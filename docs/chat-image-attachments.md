# Chat Image Attachments

Chat accepts local PNG, JPEG/JPG, and WebP images. Users can select or paste
images in the composer, or drag them onto the message-and-composer canvas, and
send text-plus-image or image-only messages. SVG, arbitrary files, user URLs,
`file://` paths, and browser `blob:` URLs are not accepted by the backend.

## Flow

```text
browser selects image
  -> local blob URL for pending preview only
  -> POST /api/chat/attachments with multipart bytes
  -> backend validates and commits pending attachment metadata
  -> backend writes the validated bytes to the final storage key
  -> message request sends only { id, kind: "image" }
  -> provider completes successfully
  -> user message, assistant message, and attachment links commit atomically
```

On provider or message-persistence failure, the attachment stays pending. The
frontend can delete a pending attachment before send. Sent attachments follow
their chat message lifecycle. If the final-path write fails during upload, the
backend hard-deletes the pending metadata and the durable deletion worker treats
the partial or missing file idempotently.

## API

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/api/chat/attachments` | Upload one multipart field named `file` |
| `DELETE` | `/api/chat/attachments/:attachment_id` | Delete an owned pending attachment |
| `GET` | `/api/chat/attachments/:attachment_id/preview` | Return owned stored image bytes |
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
be unique, pending, image-kind, use a currently supported PNG, JPEG, or WebP
MIME type, and be owned by the same session/account as the chat. This prevents
legacy pending attachments in a removed format from reaching the provider.
The backend sums owned attachment `byte_size` metadata before reading any files
or calling the provider and rejects a message above 20 MiB of raw image bytes.

Upload and preview responses expose metadata and a backend preview URL, never a
storage path. Preview requests require the owner's session cookie and use
private/no-store caching.

## Validation And Storage

The backend ignores the claimed extension and browser MIME type. It detects the
format from magic bytes, reads and validates dimensions and pixel count before
full decoding, then fully decodes the image as an integrity check. GIF remains
unsupported for new uploads.

The upload route admits at most the configured per-image byte limit plus 64 KiB
of fixed multipart overhead. Requests above that body limit receive `413`
before `field.bytes()` can buffer the multipart file. Admitted decodes run on
the blocking thread pool behind a fail-fast per-process semaphore; when both
default decode slots are occupied, upload receives `429` instead of waiting.
The permit remains owned by the blocking task until decoding finishes, including
after request cancellation.

Default and production limits are:

| Limit | Default | Production maximum |
| --- | ---: | ---: |
| Raw bytes per image | 10 MiB | 10 MiB |
| Images per message | 4 | 4 |
| Width | 8,192 | 8,192 |
| Height | 8,192 | 8,192 |
| Pixels | 20,000,000 | 20,000,000 |
| Decoder allocation budget per image | 128 MiB | 128 MiB |
| Concurrent decodes per API process | 2 | 4 |
| Total raw image bytes per message | 20 MiB | 20 MiB |
| Stored attachment bytes per owner | 200 MiB | 200 MiB |

These limits are configured by `CHAT_ATTACHMENT_*`. Decoder width, height, and
allocation limits are passed explicitly to the image decoder. Files are stored
outside the web root under server-generated keys rooted at
`CHAT_ATTACHMENT_UPLOAD_DIR`. The current implementation stores the validated
original bytes; it does not re-encode images or strip metadata.

Storage quota is enforced after image validation and before the final-path
write. Registered owners share one quota by user id across all sessions; each
guest session has its own quota. PostgreSQL serializes quota admission per
owner and commits the check together with pending attachment metadata, so
concurrent uploads and API replicas cannot reserve more than the configured
limit. Usage may equal the limit. An upload that would exceed it returns `409`
with the existing `conflict: image attachment storage quota exceeded` error and
the `image_storage_limit` reason, and creates neither metadata nor a deletion
record.

Hard deletion from `chat_attachments` is the only attachment-removal lifecycle.
A database trigger records the storage key, byte size, and owner snapshots in a
durable deletion queue in the same transaction, including for foreign-key
cascades caused by clearing messages, deleting chats, or deleting guest
sessions. Pending attachments older than 24 hours are hard-deleted in batches;
linked attachments are not targeted by pending cleanup.

At API startup and hourly, each replica claims at most 100 deletion records with
a 15-minute PostgreSQL lease before filesystem I/O. Successful deletion and an
already-missing file both remove the record. Other filesystem failures retain
the record for one retry no earlier than one hour later. Claim tokens prevent a
replica from completing work after its lease has been replaced.

Both live attachment metadata and owned durable deletion records count toward
storage quota. Deleting metadata therefore does not release quota; bytes stop
counting only after the worker confirms physical deletion (with a missing file
treated as successful deletion). Unowned reconciliation records are excluded
because their owner cannot be recovered.

Each maintenance run inspects at most 100 entries from the `chat-images`
directory. Scan position continues across hourly rounds within one API process;
reaching the directory end starts a new pass on a later round, while an API
restart begins again at the directory start. Only regular files with strict
`chat-images/<uuid>.(png|jpg|webp)` keys older than the 24-hour pending grace
period are eligible. A file with neither live metadata nor an existing deletion
record is enqueued with its byte size and no owner snapshot; reconciliation
never deletes files directly.

All API replicas that enable image upload must mount the same persistent
`CHAT_ATTACHMENT_UPLOAD_DIR`. Replica-local upload directories are unsupported:
preview and idempotent deletion require every replica to share one filesystem
view.

Upload has its own 12-requests-per-minute in-memory rate-limit bucket. Ownership
is checked for upload session resolution, preview, delete, and message linking.
`CHAT_IMAGE_UPLOAD_ENABLED=false` omits the native file input and attach button,
prevents paste/drop image staging, omits the upload route, and rejects
image-message requests. When the key is omitted,
production defaults it to disabled and development defaults it to enabled; the
development `.env.example` explicitly enables it.

Enforced image limits retain their existing HTTP status and `error` text and
add a stable reason:

| Reason | Boundary |
| --- | --- |
| `image_size_limit` | Upload body, bytes, dimensions, pixels, decoder allocation, or total message image bytes |
| `image_count_limit` | Images per message |
| `image_upload_rate` | Upload requests per minute |
| `image_processing_capacity` | Concurrent image decodes |
| `image_storage_limit` | Stored attachment bytes per owner |

Rate and processing-capacity responses include a 60-second retry value. The Web
maps these reasons to localized transient Aiko notices. Unsupported or invalid
images keep their specific friendly notice, and selected local images remain
available when retry is possible.

The current format allowlist applies to uploads and pending attachments being
linked. Successfully linked historical attachments remain available through
the owned preview route even if their stored MIME type is no longer accepted
for new messages.

## Provider Boundary

Persisted chat messages remain text plus attachment metadata. Provider-facing
`AiMessage` uses `Text` and `Image` parts. Image bytes are read by the backend
and never supplied as provider payloads by the browser.

- `mock` accepts image parts for deterministic tests.
- `openai` maps validated bytes to backend-generated data URLs in Chat
  Completions content parts.
- LM Studio and xAI reject image messages before chat messages are persisted.

## Frontend Rendering And Sync

Pending images use local previews. Sent images are fetched with credentials and
converted to temporary browser object URLs. User image galleries render above
and separately from the compact text bubble: one image uses a single column,
two and four images use a two-column grid, and three images use a wide first
image above two smaller images. Opening any image uses the shared dialog
lifecycle through a media-focused lightbox. The lightbox uses a compact
toolbar and full viewer surface without generic dialog padding, drag behavior,
or footer actions. One image uses the uncluttered viewer alone. Multiple images
add bounded previous/next buttons, direct thumbnails, left/right keyboard
navigation, and horizontal touch swipe. Navigation reuses the gallery's loaded
object URLs and does not fetch an image again. Missing or inaccessible previews
show a compact placeholder. Copy actions copy message text only.

Dragging a supported image file anywhere over the message-and-composer canvas
shows a non-interactive drop overlay. Dropping stages the files in the composer
through the same format, count, preview, cleanup, and send path as its file
picker. Nested drag events do not flicker the overlay. Text, links, unsupported
files, read-only chats, active sends, and deployments with image upload disabled
do not activate the canvas drop target. Composer-local drop remains available
and is handled only once when its event bubbles through the canvas.

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
