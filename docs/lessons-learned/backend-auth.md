# Backend Auth Lessons Learned

## 2026-07-08 - Free-text profile image URLs crossed the render boundary

Context:
- Registered users could edit the avatar URL stored in their profile.

Failed approach:
- The value was accepted as trimmed free text without validating its URL scheme
  and shape before persistence.

Problem observed:
- Unsafe or malformed values could be stored and later rendered by browser UI.
- A bad profile value could become a persistent client-side security boundary
  failure.

Root cause:
- Input normalization was treated as equivalent to URL validation.

Lesson:
- Do not persist user-controlled render URLs without validating the complete
  scheme and allowed development exceptions at the write boundary.

## 2026-07-04 - Browser-readable session ownership weakened HTTP-only sessions

Context:
- Guest and registered requests needed a stable ownership identity.

Failed approach:
- The frontend stored the session identifier in browser-readable storage and
  sent it explicitly on API requests.

Problem observed:
- Browser script access reduced the security value of an HTTP-only session and
  allowed stale client identifiers to conflict with cookie state.

Root cause:
- Session ownership was duplicated across cookie and frontend-managed state.

Lesson:
- Do not make browser-readable storage the primary ownership boundary when an
  HTTP-only session can own the request.
