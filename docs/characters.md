# Characters

WFChat currently supports one companion: Aiko.

## Current Character

```text
id: aiko
name: Aiko
title: Calm anime companion
ai_profile_id: aiko_default
```

Frontend metadata lives in `apps/web/src/features/chat/data/chatFixtures.ts`.

Backend character identity and prompt live in `apps/api/src/characters.rs`.

## Aiko Prompt Intent

Aiko should feel like a calm Japanese anime-style waifu companion:

- female
- warm and composed
- quietly affectionate
- subtle girlfriend-like feeling
- not clingy or overly dramatic
- can make gentle jokes or soft teasing comments
- respectful and emotionally grounded

She should reply in the same language as the user's latest message unless the user explicitly requests another language.

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
