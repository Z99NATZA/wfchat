# Agent Work Priority

Use this file as the first document to read before starting a new scoped agent task.

## Active Scope

Harden chat image attachment storage in two separately authorized implementation
sessions:

1. Make attachment-file deletion durable and reclaim leaked or orphaned files.
2. Add an atomic per-owner storage quota on top of that deletion lifecycle.

The next `ok impl` authorizes Session 1 only. Session 2 must not begin until
Session 1 satisfies its required outcome and the user gives a new `ok impl` for
the quota session.

Both sessions share these invariants:

- After Session 1, attachment metadata is committed before a final-path image
  file is created. Every such file is therefore represented by either live
  attachment metadata or a durable deletion record.
- Attachment bytes remain chargeable until physical deletion is confirmed.
- A missing file is a successful, idempotent deletion result.
- Cleanup work is bounded and safe to retry across API restarts and replicas.
- When image upload is enabled on more than one API replica, every replica must
  mount the same persistent `CHAT_ATTACHMENT_UPLOAD_DIR`. Replica-local upload
  directories are unsupported because preview and idempotent deletion require
  a shared filesystem view.
- Registered owners are identified by user id; guests are identified by session
  id, matching the existing attachment ownership boundary.
- Pre-existing unreferenced files with no recoverable owner are the sole
  accounting exception. They must enter deletion as unowned reconciliation
  records and must never be treated as live attachments.

## Required Read Order

Before either implementation session, read these sources completely in order:

1. `docs/chat-image-attachments.md`
2. `apps/api/src/attachments.rs`
3. `apps/api/src/chat/attachments.rs`
4. `apps/api/src/store/attachments.rs`
5. Attachment-related sections of `apps/api/src/store/chat.rs`
6. Guest-session deletion and cleanup paths in `apps/api/src/session.rs` and
   `apps/api/src/store/`
7. `apps/api/src/state.rs`
8. Attachment schema and later ownership migrations in `apps/api/migrations/`
9. Attachment settings and production validation in `apps/api/src/config.rs`

For Session 2, also read the final Session 1 migration, deletion-store methods,
worker implementation, tests, and updated attachment documentation before
changing quota admission.

## Required Outcome

### Session 1: Durable deletion and reclamation

- Add a forward-only migration for durable attachment-file deletion records.
  Each record stores a unique storage key, byte size, owner session/user UUID
  snapshots, attempt count, next-attempt time, and a claim token with a
  15-minute lease. Owner UUIDs are accounting values, not foreign keys; database
  deletion of a session or user must not delete the record. Reconciled legacy
  orphans may have no owner UUID.
- Make hard deletion from `chat_attachments` the canonical metadata-removal
  operation. A database row trigger must insert its deletion record in the same
  PostgreSQL transaction, including when the hard deletion is caused by a
  foreign-key cascade. Do not use `deleted_at` as the new deletion lifecycle;
  migrate existing soft-deleted rows through the durable queue.
- Change upload ordering in Session 1: create pending attachment metadata before
  writing its final-path file. If the write fails, hard-delete the pending row
  so the same transactional deletion lifecycle handles a partial or missing
  file. Do not defer this ordering change to Session 2.
- Route every existing removal path through hard deletion: explicit deletion of
  a pending attachment, stale-pending cleanup, message clearing, chat deletion,
  and attachment removal caused by session cleanup or database cascades. Do not
  add an endpoint for deleting one already-linked image independently.
- Process at most 100 deletion records immediately at API startup and once per
  hour afterward. Claim work with PostgreSQL row locking that skips work claimed
  by another replica, persist the 15-minute lease before filesystem I/O, and
  guard completion with the claim token. Successful or already-missing files
  remove their records. Other filesystem failures clear the claim and set the
  next attempt one hour later; there is no retry loop within the same run.
- Inspect at most 100 attachment-directory entries per startup/hourly
  reconciliation run. Continue the directory scan across scheduled runs within
  one API process and start a new pass after reaching the end; a process restart
  may begin again at the directory start. Only strict chat-image storage keys
  older than the existing 24-hour pending grace period are eligible.
  Immediately before enqueueing, confirm that the key has neither live
  attachment metadata nor an existing deletion record. Enqueue it as an unowned
  deletion record rather than deleting it outside the worker.
- Deletion records created for a guest must survive deletion of that guest
  session. Guest-to-user promotion must reparent matching deletion records in
  the same promotion transaction and with the same target owner identity used
  for live chat attachments.
- Preserve current ownership, preview, pending expiry, linked-history, and
  PNG/JPEG/WebP behavior.
- Document the shared-filesystem requirement for multi-replica deployments. Do
  not add storage-node routing or treat replica-local directories as supported.
- Test application-state constructors must not start memory, guest-cleanup, or
  attachment-maintenance background workers. Production construction starts
  each required worker exactly once.
- Add database-backed regression coverage for all deletion entry points,
  trigger behavior under cascades, metadata-before-file failure cleanup, claim
  exclusion and lease expiry, idempotent missing-file handling, one-hour retry
  retention, 100-item bounds, owner persistence across session deletion,
  promotion reparenting, reconciliation eligibility, and retained owner/byte
  accounting data.
- Update configuration/environment examples only if required by the worker and
  update `docs/chat-image-attachments.md`. Run focused tests, Rust formatting,
  Clippy, and `git diff --check` under the applicable authorization.

Session 1 excludes storage quota admission, quota UI, object-storage support,
deduplication, admin tooling, and general-purpose filesystem cleanup.

### Session 2: Atomic per-owner storage quota

- Add `CHAT_ATTACHMENT_MAX_STORAGE_BYTES_PER_OWNER` with a default and production
  maximum of 209,715,200 bytes (200 MiB). It must be positive. Do not introduce
  guest/account tiers or plan-based quotas.
- Charge live pending attachments, linked attachments, and durable deletion
  records whose files have not yet been confirmed deleted. Owner usage plus the
  incoming validated byte size may equal, but must not exceed, 200 MiB.
- Check and reserve quota in PostgreSQL as one serialized operation per owner so
  concurrent uploads and multiple API replicas cannot exceed the limit.
- The serialized quota check and pending-metadata insert must be one transaction
  and must retain Session 1's metadata-before-file ordering. Quota rejection
  occurs before the final-path write and must not leave attachment metadata or a
  deletion record behind. A later file-write failure follows Session 1.
- Return HTTP `409 Conflict` with the exact JSON body
  `{"error":"conflict: image attachment storage quota exceeded"}` when owner
  usage would exceed the quota. Keep the existing per-file, per-message, decode,
  rate-limit, and ownership checks unchanged.
- Add database-backed tests for exact-boundary admission, over-limit rejection,
  concurrent uploads, registered-user ownership across sessions, guest-session
  isolation, deletion-pending accounting, and quota release only after confirmed
  file deletion.
- Update configuration/environment examples and
  `docs/chat-image-attachments.md`. Run focused tests, Rust formatting, Clippy,
  and `git diff --check` under the applicable authorization.

Session 2 excludes quota dashboards, client-side quota displays, storage tiers,
global capacity management, object-storage support, deduplication, and changes
to non-image attachments.

## Authorization And Verification

- Repository changes require the applicable standalone authorization command:
  `ok impl`, `ok refine`, `ok fix`, or `ok update`. Use the clearly agreed scope;
  if it is missing or ambiguous, ask for clarification. Without the applicable
  command, repository work is read-only, and other wording does not grant
  authorization.
- `ok impl`, `ok refine`, and `ok fix` include focused tests and fixes for
  failures caused by the authorized changes.
- Do not run full checks by default. `ok tests` permits, but does not require,
  running any local test suites. `ok ci` likewise permits any local equivalents
  in `.github/workflows/ci.yml`. Neither command authorizes repository changes.
- Reuse valid results. Do not weaken assertions or fix unrelated behavior.
  Report unrelated, pre-existing, skipped, or blocked checks with their reasons.
- No authorization command permits commits, pushes, pull requests, releases, or
  remote actions.

## Documentation Rules

- Treat code, configuration, migrations, and tests as the source of truth.
- Keep `docs/` limited to current behavior, ownership, boundaries, limits,
  failure handling, and operating commands.
- Update the owning domain document; create a new file only when none exists.
- Lead with the outcome, use only necessary headings, and state each fact once.
- Prefer short paragraphs, compact lists, and tables for repeated mappings.
- Link to authoritative source instead of copying schemas, configuration, or
  test catalogs. Retain exact contracts and safety-critical limits.
- Do not include status labels, implementation journals, milestones, rollout
  plans, open questions, recommendations, or future work.
- Put concrete failed approaches in `docs/lessons-learned/`, version history
  in `docs/release/`, and active task details in this file. Delete other stale
  or duplicated material.
- Before finishing, verify links and repository paths, search for stale
  plan/status language, and run `git diff --check`.

## Notes

- Keep this reusable template. After completing a priority, reset only
  `Active Scope`, `Required Read Order`, and `Required Outcome`.
- Keep this file short and task-focused.
- `docs/architecture.md` is an architecture index, not the source of detailed behavior.
- Read `docs/lessons-learned/*` only for the subsystem being changed, when debugging
  a regression, or before reworking behavior with a known failure mode.
