# Chat Image Attachments

This document scopes the first secure image attachment implementation for WFChat chat messages.

Read this before changing chat upload, message persistence, rendering, provider adapters, or sync behavior for image messages.

## Goal

Let users send local images to the chat so the assistant can understand them through provider-owned multimodal message parts.

## First Scope

- Support `image/png`.
- Support `image/jpeg`.
- Support `image/webp`.
- Support `image/gif`.
- Support local image files selected from the user's device.
- Support drag and drop.
- Support pasted clipboard images.
- Support image-only messages.
- Support text plus image messages.
- Do not support user-provided image URLs.
- Do not support `file://` URLs.
- Do not support local filesystem paths.
- Do not support SVG.
- Do not support arbitrary file attachments.
- Do not expose provider or model controls in the frontend.

## Security Rules

- Upload image bytes with `multipart/form-data`.
- Validate image bytes on the backend.
- Do not trust browser `Content-Type`.
- Do not trust file extension.
- Do not trust original filename.
- Check magic bytes.
- Decode the image to prove it is a valid image.
- Enforce a MIME allowlist.
- Enforce max bytes per image.
- Enforce max images per message.
- Enforce max width.
- Enforce max height.
- Enforce max pixel count.
- Reject malformed images.
- Reject unsupported animated/image container behavior unless explicitly handled.
- Reject SVG.
- Strip metadata/EXIF when practical.
- Generate storage keys server-side.
- Do not use original filenames in storage paths.
- Store outside the web root.
- Serve previews through authenticated backend endpoints.
- Check attachment ownership on every read, delete, and message send.
- Require attachment owner to match the chat owner.
- Delete orphan attachments automatically.
- Do not include local paths, storage paths, raw provider errors, or internal storage details in API errors.

## Frontend Flow

- Status: implemented for local image selection, paste, drag/drop, preview, upload, send, and render.
- Enable the image button in `ChatComposer`.
- Add a hidden file input for accepted image types.
- Allow drag and drop onto the composer.
- Allow paste from clipboard when the focused target is the composer.
- Create a local `blob:` URL only for browser preview.
- Never send `blob:` URLs to the backend.
- Never send local filesystem paths to the backend.
- Upload selected images before sending the message.
- Render pending state through the existing sending state.
- Render thumbnail chips above the textarea.
- Allow removing each pending image before send.
- Disable duplicate sends while upload or send is active.
- Allow submit when text is non-empty or at least one image is attached.
- Create optimistic user messages with thumbnails.
- Keep assistant SSE streaming behavior unchanged.

## Backend API

### Upload Attachment

Status: implemented.

```text
POST /api/chat/attachments
Content-Type: multipart/form-data
X-WFChat-Session: <session uuid>
```

Request fields:

- `file`: image file bytes.

Response:

```json
{
  "id": "uuid",
  "kind": "image",
  "mime_type": "image/png",
  "byte_size": 123456,
  "width": 1024,
  "height": 768,
  "preview_url": "/api/chat/attachments/uuid/preview"
}
```

### Delete Pending Attachment

Status: implemented.

```text
DELETE /api/chat/attachments/:attachment_id
X-WFChat-Session: <session uuid>
```

Rules:

- Allow deleting only attachments owned by the current session/user.
- Allow deleting pending attachments.
- For sent-message attachments, prefer soft delete or deny until a message-delete flow owns it.

### Preview Attachment

Status: implemented.

```text
GET /api/chat/attachments/:attachment_id/preview
X-WFChat-Session: <session uuid>
```

Rules:

- Authenticate with the same session ownership model as chat.
- Return only validated image bytes.
- Use private/no-store cache headers for the first implementation.
- Do not expose storage keys or filesystem paths.

### Send Message

Status: implemented for attachment id validation, message linking, SSE, and non-streaming send.

Existing endpoints stay:

```text
POST /api/chats/:chat_id/messages
POST /api/chats/:chat_id/messages/stream
```

Request body becomes:

```json
{
  "content": "Please describe this image.",
  "attachments": [
    {
      "id": "uuid",
      "kind": "image"
    }
  ]
}
```

Rules:

- `content` may be empty only when attachments are present.
- `attachments` must contain previously uploaded attachment ids.
- Every attachment must be pending, valid, image-kind, and owned by the same chat owner.
- On successful assistant completion, link attachments to the persisted user message.
- On provider failure, do not link pending attachments to a message.
- Streaming event names remain unchanged.

## Database Plan

Status: implemented.

Added `chat_attachments`.

Columns:

- `id uuid primary key`
- `owner_session_id uuid not null references auth_sessions(id) on delete cascade`
- `owner_user_id uuid null`
- `chat_id uuid null references chats(id) on delete cascade`
- `message_id uuid null references chat_messages(id) on delete cascade`
- `kind text not null`
- `mime_type text not null`
- `byte_size bigint not null`
- `width integer null`
- `height integer null`
- `sha256 text not null`
- `storage_key text not null`
- `created_at timestamptz not null default now()`
- `deleted_at timestamptz null`

Indexes:

- `idx_chat_attachments_owner_created (owner_session_id, created_at desc)`
- `idx_chat_attachments_owner_user_created (owner_user_id, created_at desc)`
- `idx_chat_attachments_message (message_id)`
- `idx_chat_attachments_chat (chat_id)`

## Storage Plan

Status: implemented for local backend-owned storage.

- Add backend-owned upload directory configuration.
- Store files under generated keys.
- Keep original filename only as optional display metadata if needed later.
- Keep storage outside frontend public assets.
- Avoid direct static serving for the first implementation.
- Add cleanup for pending orphan files.
- Keep storage interface replaceable for future S3-compatible storage.

## AI Message Model

Status: implemented.

Current state:

```text
Stored chat messages persist role + content string for compatibility.
```

Provider-facing state:

```text
AiMessage = role + parts
```

Parts:

- `Text`
- `Image`

Rules:

- Existing persisted text-only history is converted into `Text` parts when
  building AI history.
- New user sends are converted into `Text` parts plus backend-owned `Image`
  parts from validated attachment records.
- Image bytes are read from backend storage during send; the frontend sends
  only backend-issued attachment ids.
- Provider adapters convert `Image` parts into provider-specific payloads.
- Frontend never sends provider-specific image payloads.
- Stored chat message `content` remains text-only so existing rendering, copy,
  speech, sync metadata, SSE replacement, and message history behavior stay
  compatible.

## Provider Plan

Status: implemented for mock support, OpenAI vision mapping, and safe
unsupported-provider failure.

- OpenAI is the first real vision provider.
- OpenAI Chat Completions payloads map text-only messages to string `content`
  and image messages to `content` parts containing `text` and `image_url`
  entries.
- OpenAI image payloads use backend-generated `data:<mime>;base64,...` URLs
  from validated attachment bytes; user-provided image URLs, paths, `file://`,
  and `blob:` URLs are not accepted.
- Mock provider accepts image parts for tests and reports image attachment
  counts in its deterministic reply.
- Providers without image support return
  `image attachments are not supported by the configured AI provider` before
  the user/assistant messages are persisted.
- LM Studio image support is later.
- xAI image support is later.
- Anthropic image support is later.
- Provider/model selection remains backend-owned.

## Rendering Plan

Status: implemented for message thumbnails. Full preview dialog and missing-image placeholder remain planned.

- User bubbles render plain text.
- User bubbles render attached image thumbnails.
- Assistant bubbles keep current Markdown rendering.
- Copy-message action copies text only.
- Thumbnail rendering fetches the backend preview URL with the session header and renders a browser `blob:` URL.
- Image click opens the fetched `blob:` URL in a new tab.
- Preview dialog uses authenticated backend preview bytes. Planned.
- Preview dialog does not expose storage paths.
- Missing image shows a compact placeholder. Planned.
- Upload failures show a composer-level error.

## Sync Plan

Status: implemented for message attachment metadata in local message cache. Raw image sync remains out of scope.

- Sync attachment metadata with chat message cache.
- Do not sync raw image bytes in the first implementation.
- Cached read-only chats may show attachment metadata.
- Missing attachments render placeholders.
- Attachment tombstones are future work.

## Limits

Initial defaults:

- Max images per message: `4`.
- Max bytes per image: `10 MB`.
- Max pixels per image: `20 MP`.
- Max width: `8192`.
- Max height: `8192`.

These are backend-owned configuration values.

Current backend config:

- `CHAT_ATTACHMENT_UPLOAD_DIR`
- `CHAT_ATTACHMENT_MAX_BYTES`
- `CHAT_ATTACHMENT_MAX_IMAGES_PER_MESSAGE`
- `CHAT_ATTACHMENT_MAX_WIDTH`
- `CHAT_ATTACHMENT_MAX_HEIGHT`
- `CHAT_ATTACHMENT_MAX_PIXELS`

## Tests

Backend:

- Accept PNG upload. Implemented.
- Accept JPEG upload. Planned.
- Accept WebP upload. Planned.
- Accept GIF upload. Planned.
- Reject SVG upload. Implemented.
- Reject wrong magic bytes. Implemented.
- Reject unsupported MIME. Implemented through magic-byte allowlist.
- Reject oversized image. Implemented.
- Reject oversized dimensions. Implemented.
- Reject too many attachments. Implemented for message send.
- Reject attachment owned by another session. Implemented for preview/delete.
- Reject URL/path attachment input. Implemented by upload-only API shape.
- Link attachments only after successful message completion. Implemented.
- Leave pending attachments unlinked after provider failure. Implemented.
- Return safe upload errors. Implemented.
- Return safe stream errors. Implemented.

Frontend:

- File picker accepts only supported image types. Implemented.
- Drag and drop adds images. Implemented.
- Clipboard paste adds images. Implemented.
- Thumbnail preview renders. Implemented.
- Remove image works. Implemented.
- Image-only send works. Implemented.
- Text plus image send works. Implemented.
- Upload failure state renders. Implemented.
- Send is disabled while upload is pending. Implemented through send state.
- Optimistic user image message renders. Implemented.
- Final server message replacement preserves attachments. Implemented.

Provider:

- Mock provider receives image parts. Implemented.
- OpenAI adapter maps text and image parts. Implemented.
- Unsupported provider returns a clear image unsupported error. Implemented.

## Milestones

1. Documentation and contract.
2. Database and storage foundation. Implemented.
3. Secure upload API. Implemented.
4. Frontend picker, paste, drop, and preview. Implemented.
5. Message request attachments. Implemented.
6. Message rendering attachments. Implemented.
7. AI message parts. Implemented.
8. OpenAI vision adapter. Implemented.
9. Tests and cleanup. Implemented for provider mapping and unsupported provider safety.
10. Manual QA and security review.

## Manual QA

- Upload PNG from device.
- Upload JPEG from device.
- Upload WebP from device.
- Upload GIF from device.
- Paste screenshot from clipboard.
- Drag image into composer.
- Remove pending image.
- Send image-only message.
- Send text plus image message.
- Verify assistant can answer about image content.
- Verify unsupported provider error is clear.
- Verify local path cannot be submitted.
- Verify user URL cannot be submitted.
- Verify another session cannot fetch preview.
- Verify deleted pending attachment cannot be previewed.
- Verify refresh loads sent image metadata.

## Completion Criteria

- Users can send local PNG/JPEG/WebP/GIF images.
- Backend validates image bytes.
- Chat messages persist image attachment metadata.
- User message bubbles render image thumbnails.
- OpenAI-backed assistant can use image content.
- Unsupported providers fail safely.
- No local URL/path flow exists.
- Existing text chat and SSE streaming still work.
- Tests cover validation, ownership, rendering, and provider mapping.
- Docs match implemented behavior.

Current status: backend upload, preview, delete, validation, storage, message linking, metadata persistence, ownership checks, frontend composer image selection, upload, message send, cache metadata, thumbnail rendering, AI message parts, mock image-part handling, OpenAI vision payload mapping, and unsupported-provider image safety are implemented. Preview dialog, missing-image placeholder, raw image sync, and orphan cleanup scheduling are still planned.
