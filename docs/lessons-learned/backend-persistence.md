# Backend Persistence Lessons Learned

## 2026-07-12 - Migration line-ending changes broke SQLx checksums

Context:
- The same applied SQL migrations were used from Windows and Linux checkouts.

Failed approach:
- Migration files were allowed to change between LF and CRLF without changing
  their SQL meaning.

Problem observed:
- PostgreSQL stored one migration checksum while a later checkout embedded
  different bytes, causing SQLx to reject API startup and the proxy to return
  `502`.

Root cause:
- SQLx validates migration bytes, not normalized SQL semantics.

Lesson:
- Do not allow platform-specific line-ending conversion for immutable applied
  migrations.

## 2026-07-11 - Post-commit background enqueue could lose chat work

Context:
- Persisted chat turns needed follow-up automatic-memory extraction.

Failed approach:
- The follow-up job could be enqueued only after the chat transaction committed.

Problem observed:
- A crash between chat commit and job creation could permanently lose the
  follow-up work while leaving the chat turn successfully stored.

Root cause:
- Two durable state changes that represented one accepted operation did not
  share a transaction boundary.

Lesson:
- Do not create required durable follow-up work in a separate post-commit gap.

## 2026-07-03 - Database failures were converted into successful empty results

Context:
- Store methods returned optional rows, booleans, or collections to API callers.

Failed approach:
- Some PostgreSQL errors were ignored or converted into `None`, `false`, empty
  lists, or optimistic success.

Problem observed:
- Database outages looked like valid not-found or empty states, hiding failed
  writes and misleading both API callers and operators.

Root cause:
- Expected domain absence and unexpected infrastructure failure shared the same
  return path.

Lesson:
- Do not collapse database errors into valid domain outcomes.
