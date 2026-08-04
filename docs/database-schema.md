# Database Schema

WFChat uses PostgreSQL. This page is a map of current data ownership and
relationships; use `apps/api/migrations/` for exact columns, constraints, and
indexes.

## Ownership Model

Every browser has an expiring `auth_sessions` row. Guest data is scoped by
session. Google login locks the active guest row, migrates supported owner data,
upserts identity/profile defaults, creates a new registered session, and revokes
the guest in one transaction. The guest row never becomes registered, and the
promoted rows are re-parented to the replacement session before the old guest
can be cleaned. The replacement cookie is sent only after commit. Logout
atomically revokes an active registered/admin session and issues one new guest
session. Account-owned reads use `owner_user_id` across that account's active
sessions.

Expired or revoked guest `auth_sessions` rows are processed in batches of at
most 1,000 every 10 minutes. Before deletion, the legacy backfill reparents
account-owned chats, attachments, memory/outbox/follow-up rows, Cafe state and
rewards, and sync entities/commits to one matching registered session. A legacy
sync commit may still carry the guest user ID, so cleanup resolves its account
from the unambiguous `owner_user_id` data attached to the same guest session.
Conflicting Cafe and sync keys merge without double-counting an idempotent row.
If the account mapping is ambiguous or no target exists, the guest session and
its rows remain. Foreign-key cascades remove only guest-owned data; registered
session rows are excluded.

`auth_identities` stores provider identity data. `user_profiles` stores the
editable display name and avatar URL; a later provider login does not overwrite
profile edits.

## Tables

| Table                         | Role                                                            |
| ----------------------------- | --------------------------------------------------------------- |
| `auth_sessions`               | Guest/registered request identity and ownership boundary        |
| `auth_identities`             | Google subject, email, name, and provider avatar                |
| `user_profiles`               | Editable account display name and avatar                        |
| `chats`                       | Owner- and character-scoped chat sessions                       |
| `chat_messages`               | Ordered user/assistant/system text within a chat                |
| `chat_attachments`            | Validated image metadata; pending or linked to one user message |
| `memory_items`                | Normalized learned context keyed per owner and character        |
| `memory_sources`              | Chat/message evidence supporting a memory item                  |
| `memory_extraction_jobs`      | Durable, retryable capture outbox                               |
| `memory_follow_up_deliveries` | Idempotent New Chat follow-up claims                            |
| `cafe_progress`               | Per-session stars and unlocked cosmetics                        |
| `cafe_cosmetic_loadouts`      | Per-session equipped cosmetic                                   |
| `cafe_room_rewards`           | One reward per room, round, and session                         |
| `sync_entities`               | Latest generic sync value or tombstone per item                 |
| `sync_commits`                | Per-session sync operation idempotency record                   |

## Core Relationships

```text
auth_session
  -> chats -> chat_messages -> chat_attachments
           -> memory_sources -> memory_items
  -> memory_extraction_jobs
  -> memory_follow_up_deliveries
  -> cafe_progress / cafe_cosmetic_loadouts / cafe_room_rewards
  -> sync_entities / sync_commits

registered user
  -> auth_identities
  -> user_profile
  -> account-owned views of chats, memory, cafe progress, and sync
```

Chat attachment bytes live in backend-owned file storage; PostgreSQL stores
metadata and generated storage keys. Pending rows have no chat/message link.
Successful send links attachments atomically with the user and assistant
messages.

Chat creation serializes admission per owner and rechecks the 50-chat cap in
its transaction. Turn append locks the chat and rechecks both the 100-message
cap and the 500,000-Unicode-scalar stored-content cap before inserting either
message. A rejected append stores neither message and links no attachment.

One memory item can have many sources. Chat/message deletion cascades source
removal; store transactions delete unsupported memories or recalculate retained
confidence. Extraction jobs reference the persisted turn and store its timezone.
Follow-up deliveries reference one memory and may later attach to one chat.

Cafe rooms themselves are in-process. PostgreSQL stores only progress, loadout,
and idempotent round rewards. Account progress is aggregated across promoted
session rows; the latest account loadout wins deterministically.

Generic sync remains separate from canonical chat tables. `sync_entities`
stores cache/delta items, and pulled chat items are not materialized into
`chats` or `chat_messages`.

## Domain Details

- [Chat image attachments](chat-image-attachments.md)
- [Automatic memory](automatic-memory.md)
- [Aiko Cafe](aiko-cafe.md)
- [Sync system](sync-system.md)
- [Database migrations](database-migrations.md)
