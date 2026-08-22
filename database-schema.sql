-- ============================================================
-- NOUVII Task Manager & Photo Library — PostgreSQL Schema
-- Version: 1.0.0  (Phase 1 baseline — matches src/types/*.ts)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pg_trgm";    -- fuzzy search on tags/titles
CREATE EXTENSION IF NOT EXISTS "citext";     -- case-insensitive emails

-- ---------- Enums ----------
CREATE TYPE user_role        AS ENUM ('owner', 'admin', 'manager', 'member', 'viewer');
CREATE TYPE task_status      AS ENUM ('todo', 'in_progress', 'in_review', 'completed', 'cancelled');
CREATE TYPE task_priority    AS ENUM ('low', 'medium', 'high', 'urgent');
CREATE TYPE photo_status     AS ENUM ('processing', 'ready', 'failed');
CREATE TYPE approval_status  AS ENUM ('draft', 'pending', 'in_review', 'approved', 'rejected', 'changes_requested');
CREATE TYPE approval_action  AS ENUM ('approve', 'reject', 'request_changes', 'comment');
CREATE TYPE deal_stage       AS ENUM ('lead', 'qualified', 'proposal', 'negotiation', 'closed_won', 'closed_lost');
CREATE TYPE ai_tag_status    AS ENUM ('suggested', 'accepted', 'rejected');
CREATE TYPE sync_operation   AS ENUM ('create', 'update', 'delete');
CREATE TYPE sync_status      AS ENUM ('queued', 'in_flight', 'done', 'error');

-- ---------- Organizations & users ----------
CREATE TABLE organizations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  logo_url      TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email          CITEXT NOT NULL UNIQUE,
  password_hash  TEXT,                          -- null when SSO-only
  full_name      TEXT NOT NULL,
  avatar_url     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE organization_members (
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role            user_role NOT NULL DEFAULT 'member',
  invited_by      UUID REFERENCES users(id),
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);

CREATE TABLE teams (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  color           TEXT,                          -- hex accent used in UI chips
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE team_members (
  team_id  UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (team_id, user_id)
);

-- ---------- Merchants ----------
CREATE TABLE merchants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  location        TEXT,                          -- e.g. 'Malé', 'Hulhumalé'
  contact_id      UUID,                          -- FK added after contacts table
  logo_url        TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

-- ---------- Projects ----------
CREATE TABLE projects (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  cover_photo_id  UUID,                          -- FK added after photos table
  archived        BOOLEAN NOT NULL DEFAULT false,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Tasks ----------
CREATE TABLE tasks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id      UUID REFERENCES projects(id) ON DELETE SET NULL,
  parent_task_id  UUID REFERENCES tasks(id) ON DELETE CASCADE,   -- sub-tasks
  title           TEXT NOT NULL,
  description     TEXT,
  status          task_status   NOT NULL DEFAULT 'todo',
  priority        task_priority NOT NULL DEFAULT 'medium',
  due_at          TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  position        INTEGER NOT NULL DEFAULT 0,     -- manual ordering within column
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Google Calendar sync
  gcal_event_id   TEXT,
  gcal_synced_at  TIMESTAMPTZ
);

CREATE TABLE task_assignees (
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, user_id)
);

CREATE TABLE task_labels (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  color           TEXT NOT NULL,
  UNIQUE (organization_id, name)
);

CREATE TABLE task_label_links (
  task_id  UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  label_id UUID NOT NULL REFERENCES task_labels(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, label_id)
);

-- ---------- Photos ----------
CREATE TABLE photos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id      UUID REFERENCES projects(id) ON DELETE SET NULL,
  merchant_id     UUID REFERENCES merchants(id) ON DELETE SET NULL,
  uploaded_by     UUID REFERENCES users(id),
  status          photo_status NOT NULL DEFAULT 'processing',
  title           TEXT,
  description     TEXT,
  -- storage
  s3_key          TEXT NOT NULL,
  thumb_s3_key    TEXT,
  content_type    TEXT NOT NULL,
  size_bytes      BIGINT NOT NULL,
  width_px        INTEGER,
  height_px       INTEGER,
  -- capture metadata (EXIF)
  captured_at     TIMESTAMPTZ,
  device_model    TEXT,
  gps_lat         DOUBLE PRECISION,
  gps_lng         DOUBLE PRECISION,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ                     -- soft delete
);

ALTER TABLE projects
  ADD CONSTRAINT projects_cover_photo_fk
  FOREIGN KEY (cover_photo_id) REFERENCES photos(id) ON DELETE SET NULL;

CREATE TABLE photo_versions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photo_id    UUID NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  version_no  INTEGER NOT NULL,
  s3_key      TEXT NOT NULL,
  size_bytes  BIGINT NOT NULL,
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  note        TEXT,
  UNIQUE (photo_id, version_no)
);

CREATE TABLE photo_tags (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photo_id    UUID NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  tag         TEXT NOT NULL,
  source      TEXT NOT NULL DEFAULT 'user',      -- 'user' | 'ai'
  ai_status   ai_tag_status,                     -- only when source = 'ai'
  confidence  REAL,                              -- 0..1, AI only
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (photo_id, tag, source)
);

-- AI-extracted metadata from Claude Vision (Phase 4)
CREATE TABLE photo_ai_metadata (
  photo_id      UUID PRIMARY KEY REFERENCES photos(id) ON DELETE CASCADE,
  objects       JSONB NOT NULL DEFAULT '[]',     -- [{label, confidence}]
  ocr_text      TEXT,
  classification TEXT,                           -- product | location | person | document | other
  quality_issues JSONB NOT NULL DEFAULT '[]',    -- [{issue: 'blur'|'lighting', severity}]
  raw_response  JSONB,
  model         TEXT,
  processed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Comments (photos & tasks, threaded, pinnable) ----------
CREATE TABLE comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photo_id    UUID REFERENCES photos(id) ON DELETE CASCADE,
  task_id     UUID REFERENCES tasks(id) ON DELETE CASCADE,
  parent_id   UUID REFERENCES comments(id) ON DELETE CASCADE,
  author_id   UUID REFERENCES users(id),
  guest_name  TEXT,                              -- client-portal commenters
  body        TEXT NOT NULL,
  -- pin-to-coordinates on a photo (fractions 0..1 of rendered image)
  pin_x       REAL CHECK (pin_x BETWEEN 0 AND 1),
  pin_y       REAL CHECK (pin_y BETWEEN 0 AND 1),
  resolved_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(photo_id, task_id) = 1)
);

-- ---------- Approval workflows ----------
CREATE TABLE approval_workflows (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE approval_workflow_steps (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id  UUID NOT NULL REFERENCES approval_workflows(id) ON DELETE CASCADE,
  step_no      INTEGER NOT NULL,
  name         TEXT NOT NULL,
  approver_id  UUID REFERENCES users(id),        -- null = any admin/manager
  UNIQUE (workflow_id, step_no)
);

CREATE TABLE approval_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photo_id      UUID NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  workflow_id   UUID REFERENCES approval_workflows(id) ON DELETE SET NULL,
  status        approval_status NOT NULL DEFAULT 'pending',
  current_step  INTEGER NOT NULL DEFAULT 1,
  requested_by  UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at   TIMESTAMPTZ
);

CREATE TABLE approval_decisions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id   UUID NOT NULL REFERENCES approval_requests(id) ON DELETE CASCADE,
  step_no      INTEGER NOT NULL,
  action       approval_action NOT NULL,
  actor_id     UUID REFERENCES users(id),
  guest_name   TEXT,                             -- client-portal approvers
  feedback     TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Client portal share links (Phase 5)
CREATE TABLE share_links (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id   UUID REFERENCES projects(id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL UNIQUE,             -- store hash, never raw token
  label        TEXT,                             -- e.g. client name
  can_comment  BOOLEAN NOT NULL DEFAULT true,
  can_approve  BOOLEAN NOT NULL DEFAULT true,
  expires_at   TIMESTAMPTZ,
  revoked_at   TIMESTAMPTZ,
  created_by   UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- CRM: deals & contacts ----------
CREATE TABLE contacts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  full_name       TEXT NOT NULL,
  email           CITEXT,
  phone           TEXT,
  company         TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE merchants
  ADD CONSTRAINT merchants_contact_fk
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL;

CREATE TABLE deals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id      UUID REFERENCES contacts(id) ON DELETE SET NULL,
  name            TEXT NOT NULL,
  stage           deal_stage NOT NULL DEFAULT 'lead',
  value_cents     BIGINT,
  currency        TEXT NOT NULL DEFAULT 'USD',
  owner_id        UUID REFERENCES users(id),
  expected_close  DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE deal_photos (
  deal_id  UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  photo_id UUID NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  PRIMARY KEY (deal_id, photo_id)
);

CREATE TABLE deal_tasks (
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  PRIMARY KEY (deal_id, task_id)
);

-- ---------- Google Calendar integration (Phase 2) ----------
CREATE TABLE gcal_connections (
  user_id        UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  google_email   CITEXT NOT NULL,
  access_token   TEXT NOT NULL,                  -- encrypted at rest (app layer)
  refresh_token  TEXT NOT NULL,                  -- encrypted at rest (app layer)
  token_expires  TIMESTAMPTZ NOT NULL,
  calendar_id    TEXT NOT NULL DEFAULT 'primary',
  connected_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_synced_at TIMESTAMPTZ
);

CREATE TABLE gcal_sync_queue (
  id          BIGSERIAL PRIMARY KEY,
  task_id     UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  operation   sync_operation NOT NULL,
  status      sync_status NOT NULL DEFAULT 'queued',
  attempts    INTEGER NOT NULL DEFAULT 0,
  last_error  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

-- ---------- Notifications & audit ----------
CREATE TABLE notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,                      -- task_assigned | approval_requested | comment | ...
  payload    JSONB NOT NULL DEFAULT '{}',
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
  id              BIGSERIAL PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  actor_id        UUID REFERENCES users(id),
  guest_label     TEXT,                          -- share-link actors
  action          TEXT NOT NULL,                 -- e.g. 'photo.approve', 'task.update'
  entity_type     TEXT NOT NULL,
  entity_id       UUID,
  detail          JSONB NOT NULL DEFAULT '{}',
  ip_address      INET,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Indexes ----------
CREATE INDEX idx_tasks_org_status      ON tasks (organization_id, status) WHERE parent_task_id IS NULL;
CREATE INDEX idx_tasks_project         ON tasks (project_id);
CREATE INDEX idx_tasks_due             ON tasks (due_at) WHERE status NOT IN ('completed','cancelled');
CREATE INDEX idx_tasks_parent          ON tasks (parent_task_id);
CREATE INDEX idx_tasks_title_trgm      ON tasks USING gin (title gin_trgm_ops);
CREATE INDEX idx_photos_org            ON photos (organization_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_photos_project        ON photos (project_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_photos_merchant       ON photos (merchant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_photo_tags_tag_trgm   ON photo_tags USING gin (tag gin_trgm_ops);
CREATE INDEX idx_comments_photo        ON comments (photo_id);
CREATE INDEX idx_comments_task         ON comments (task_id);
CREATE INDEX idx_approvals_photo       ON approval_requests (photo_id);
CREATE INDEX idx_deals_org_stage       ON deals (organization_id, stage);
CREATE INDEX idx_notifications_unread  ON notifications (user_id) WHERE read_at IS NULL;
CREATE INDEX idx_audit_org_time        ON audit_log (organization_id, created_at DESC);
CREATE INDEX idx_gcal_queue_pending    ON gcal_sync_queue (status, created_at) WHERE status IN ('queued','error');

-- ---------- updated_at trigger ----------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['organizations','users','merchants','projects','tasks','photos','comments','contacts','deals']
  LOOP
    EXECUTE format('CREATE TRIGGER trg_%s_updated BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t, t);
  END LOOP;
END $$;
