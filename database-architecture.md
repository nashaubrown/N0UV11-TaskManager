# NOUVII — Database Architecture Guide

Companion to [`database-schema.sql`](./database-schema.sql). PostgreSQL 15+.

## Design principles

1. **Multi-tenant by organization.** Every business entity carries
   `organization_id`; all queries are scoped to it. Roles live on
   `organization_members` (owner → admin → manager → member → viewer).
2. **UUID primary keys** (`gen_random_uuid()`), except append-only logs
   (`audit_log`, `gcal_sync_queue`) which use `BIGSERIAL`.
3. **Soft delete only where recovery matters** — photos (`deleted_at`).
   Everything else cascades or nulls out.
4. **Timestamps are `TIMESTAMPTZ`**; `updated_at` is maintained by trigger.

## Entity map

```
organizations ─┬─ organization_members ── users
               ├─ teams ── team_members
               ├─ merchants (photo categorization; links to a contact)
               ├─ projects ─┬─ tasks (self-ref parent_task_id = sub-tasks)
               │            └─ photos ─┬─ photo_versions
               │                       ├─ photo_tags (user + AI)
               │                       ├─ photo_ai_metadata (Claude Vision)
               │                       ├─ comments (threaded, pin_x/pin_y)
               │                       └─ approval_requests ── approval_decisions
               ├─ approval_workflows ── approval_workflow_steps
               ├─ share_links (client portal, hashed tokens)
               ├─ contacts ── deals ─┬─ deal_photos
               │                     └─ deal_tasks
               └─ audit_log
users ─┬─ gcal_connections (OAuth tokens, encrypted at app layer)
       ├─ gcal_sync_queue (task → Google Calendar outbox)
       └─ notifications
```

## Domain notes

### Tasks
- `parent_task_id` gives one-level-or-deeper sub-task trees; UI treats depth 1.
- `position` supports manual ordering inside a status column (kanban).
- `gcal_event_id` / `gcal_synced_at` mirror the linked Google Calendar event;
  writes enqueue a row in `gcal_sync_queue` (transactional outbox pattern) so
  syncing survives crashes and offline periods.
- Search: trigram GIN index on `title`; filters hit `(organization_id, status)`.

### Photos
- Binary data lives in S3; the DB stores keys + metadata only.
- `merchant_id` categorizes photos by merchant (storefront shoots, menu
  photography, etc.); the library filters and groups on it. A merchant can
  point at a `contacts` row for its CRM identity.
- `photo_versions` is append-only; `version_no` increments per photo. The
  current version is the row with max `version_no` (photo row caches nothing —
  keeps writes single-purpose).
- Tags are one table for both human and AI tags, disambiguated by `source`;
  AI tags carry `ai_status` (`suggested` → `accepted`/`rejected`) and
  `confidence`. Only `accepted`/user tags feed search.
- `photo_ai_metadata` keeps Claude Vision's structured output plus the raw
  response for reprocessing/debugging.

### Comments
- One table for photo + task comments (`CHECK num_nonnulls(...) = 1`).
- `parent_id` gives threads; `pin_x`/`pin_y` (0..1 fractions) pin a comment to
  a point on the photo regardless of rendered size.
- `guest_name` supports client-portal commenters who have no user row.

### Approvals
- `approval_workflows` + ordered `approval_workflow_steps` are reusable
  templates. An `approval_request` snapshots the workflow reference and walks
  `current_step`; each `approval_decision` records who did what at which step.
- Client actions arrive via `share_links` (token stored **hashed**, optional
  expiry/revocation, per-link `can_comment` / `can_approve`).

### CRM
- Minimal pipeline: `deals` (stage enum, value in cents), `contacts`, and join
  tables linking deals to photos/tasks so shoot deliverables and follow-up
  work hang off the deal.

### Google Calendar sync
- `gcal_connections`: one per user; tokens encrypted at the app layer (AES-GCM
  with a KMS-held key) — never stored in plaintext.
- `gcal_sync_queue`: outbox consumed by a background worker with exponential
  backoff (`attempts`, `last_error`). Direction is NOUVII → Google in v1.

### Audit
- `audit_log` records every mutating action: actor (user or guest label),
  dotted `action` verb, entity ref, JSONB detail diff, IP. Append-only —
  no UPDATE/DELETE grants in production.

## Operational guidance

- **Pooling:** pg `Pool` 20–50 connections (or PgBouncer transaction mode).
- **Migrations:** this file is the baseline; use node-pg-migrate or Prisma
  Migrate from Phase 2 onward.
- **Backups:** daily base backup + WAL archiving; audit_log partitioning by
  month once it exceeds ~10M rows.
- **Search later:** if trigram search outgrows Postgres, mirror
  photo tags/AI text into a search service; the schema needs no change.
