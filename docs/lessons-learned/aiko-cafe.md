# Aiko Cafe

- Heartbeat-only disconnect detection can leave client-predicted gameplay
  looking active until the timeout. Treat a known browser-offline state as an
  immediate input boundary, and require fresh authoritative state before play
  resumes.
- Room-level reward idempotency is too broad for a replayable activity. The
  idempotency key must include the smallest repeatable reward unit, which is the
  activity round in Cafe.
