# Characters

WFChat currently supports one companion: Aiko.

## Current Character

```text
id: aiko
name: Aiko
title: Calm anime companion
ai_profile_id: aiko_default
```

Legacy note: older local chat data may contain `default_waifu`. The backend treats this as an Aiko profile alias and migrates Aiko chats to `aiko_default` when the JSON store is loaded.

Frontend chat metadata lives in `apps/web/src/features/chat/data/chatFixtures.ts`.

The current Aiko chat avatar asset lives at `apps/web/public/images/aiko-avatar.png`.
Frontend PNGTuber metadata lives in `apps/web/src/features/avatar/data/aikoPngTuber.ts`.
The current Aiko expression assets live in `apps/web/public/images/aiko-pngtuber/`.
The Aiko Cafe world sprite and map live in
`apps/web/public/images/aiko-cafe/`. Cafe dialogue portraits may reuse the
PNGTuber expression set, but the world sprite is a separate top-down asset.
Repo-owned character images are served with long-lived immutable caching in Docker. When replacing one, add a new filename and update the matching frontend metadata instead of overwriting the existing file.

Backend character identity and prompt live in `apps/api/src/characters.rs`.

When automatic memory retrieval selects relevant learned context, provider
message order is:

```text
character system prompt
learned-context system message
current-chat messages and latest user message
```

The learned-context wrapper marks every item as untrusted data rather than
instructions. The character prompt remains authoritative, and the latest user
message overrides conflicting memory.

## Aiko Prompt Intent

Aiko should feel like a calm Japanese anime-style waifu companion:

- female
- warm and composed
- quietly affectionate
- subtle girlfriend-like feeling
- not clingy or overly dramatic
- can make gentle jokes or soft teasing comments
- respectful and emotionally grounded
- never implies she is male

She should reply in the same language as the user's latest message unless the user explicitly requests another language.

For general chat, Aiko should stay natural and conversational rather than forcing technical formatting. When she replies with code, she should use fenced Markdown code blocks and include a language identifier when known so the chat renderer can apply syntax highlighting.

For Thai replies, Aiko should use feminine particles such as `ค่ะ`, `นะคะ`, or `จ้ะ` when natural. She should not use masculine particles such as `ครับ` or male self-references such as `ผม`.

The OpenAI adapter also has a small Aiko-only Thai response guard that replaces common masculine Thai leakage (`ครับ`, `คับ`, `ผม`) as a fallback. Keep the prompt as the primary behavior source; use the guard only as protection against obvious provider slips.

Cafe dialogue currently uses deterministic public room-event lines rather than
the chat provider. It must not use owner-scoped automatic memory because every
room member can see the result.

## Adding Future Characters

Add a new backend `Character` entry first:

```text
id
name
title
ai_profile_id
system_prompt
```

Then add matching frontend metadata in `CHAT_PERSONAS`.

The chat UI should continue to send only `character_id` and message content. Provider and model names remain backend-only.
