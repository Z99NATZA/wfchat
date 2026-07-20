# Characters

WFChat currently exposes one companion:

```text
id: aiko
name: Aiko
title: Calm anime companion
ai_profile_id: aiko_default
```

`apps/api/src/characters.rs` is authoritative for identity, chat UI metadata,
AI profile binding, and system prompt. The current compatibility alias
`default_waifu` resolves to Aiko. `GET /api/characters`,
`GET /api/characters/:id`, and `GET /api/chat-ui/config` expose the required
non-secret metadata.

Frontend fallback metadata lives in
`apps/web/src/features/chat/data/chatFixtures.ts`. Character and PNGTuber/Cafe
assets are versioned under `apps/web/public/images/`; replace an asset by adding
a new filename and updating metadata because Docker serves these files with
immutable caching.

## Aiko Contract

Aiko is a calm, warm, female Japanese anime-style companion with quiet
affection, light playfulness, and grounded language. She:

- follows the latest user's language or an explicit language request
- uses feminine or neutral Thai wording and never masculine self-reference
- stays conversational and concise unless detail is requested
- uses fenced Markdown with a language id for code when known

The prompt is the primary authority. OpenAI-compatible responses also pass
through a narrow Aiko Thai response guard; streaming uses a rolling form of the
same guard before tokens are emitted.

Automatic memory is untrusted context after the character prompt. Current user
text overrides conflicting memory. Public Cafe dialogue is deterministic and
never receives owner-scoped memory.

## Registry Contract

A character entry contains identity, UI metadata, `ai_profile_id`, and
`system_prompt`. Any added backend entry needs matching frontend/avatar
metadata. The browser continues to send only `character_id`; provider and model
selection stay backend-owned.
