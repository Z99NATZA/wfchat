# Chat Memory Lessons Learned

## 2026-07-14 - Temporal commitments were generalized into durable preferences

Context:
- A companion follow-up depended on recognizing a user's explicit future plan
  from a persisted chat turn.

Failed approach:
- Durable-fact extraction was also used for temporal plans without trusted
  local-time context or a writable expiration contract.

Problem observed:
- A statement about attending an event the next day was stored as a low-value
  general hobby preference, so the intended follow-up was never eligible.

Root cause:
- Classification optimized for long-lived facts and discarded the event's
  temporal semantics before follow-up eligibility was evaluated.

Lesson:
- Do not generalize relative-time commitments into durable preferences; retain
  their plan/goal kind, bounded lifetime, and original temporal reference.

## 2026-07-12 - Literal-language retrieval missed cross-language memories

Context:
- Learned context captured in one language needed to remain relevant when a
  later chat used another language.

Failed approach:
- Candidate selection and scoring relied on literal or inconsistent topic
  signals, with broad categories able to outweigh specific terms.

Problem observed:
- Persisted memories existed but were not selected for related Thai/English
  prompts, while broad matches could introduce unrelated preferences.

Root cause:
- Query selection and application scoring did not share one normalized set of
  canonical and lexical signals.

Lesson:
- Do not use separate or literal-only topic semantics across candidate lookup
  and ranking, and do not let broad categories dominate specific evidence.

## 2026-07-12 - Surviving memory jobs could recreate removed context

Context:
- Learned context could expire, lose its source chat, or be reset by its owner.

Failed approach:
- Lifecycle cleanup could remove visible memory while queued or processing work
  survived the same boundary.

Problem observed:
- Stale work could recreate context that had expired or had explicitly been
  removed.

Root cause:
- Stored memory and its pending derivation jobs were treated as independent
  lifecycle domains.

Lesson:
- Do not delete learned state without considering every queued or in-flight path
  that can recreate it.

## 2026-07-10 - Manual memory UI diverged from canonical AI context

Context:
- Users could manage facts and summaries intended to influence later chats.

Failed approach:
- Manual UI, prompt injection, browser sync cache, and canonical memory storage
  evolved as separate paths.

Problem observed:
- The UI could display information that was unavailable to backend AI context,
  and manual controls confused what the companion had actually learned.

Root cause:
- Multiple stores and ownership paths claimed to represent the same learned
  context.

Lesson:
- Do not reintroduce parallel manual-memory and canonical-memory sources of
  truth.
