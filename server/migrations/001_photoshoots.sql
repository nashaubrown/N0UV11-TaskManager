-- Photoshoot calendar: shoots with a status pipeline, crew, and Google
-- Calendar sync (Confirmed onward → event on the user's primary calendar).

CREATE TYPE shoot_status AS ENUM ('planning', 'confirmed', 'completed', 'cancelled');
-- 'Ongoing' is derived, not stored: a confirmed shoot whose time window is
-- running displays as Ongoing; one whose window has passed shows a
-- wrap-up nudge until it is marked completed.

CREATE TABLE photoshoots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id      UUID REFERENCES projects(id) ON DELETE SET NULL,
  merchant_id     UUID REFERENCES merchants(id) ON DELETE SET NULL,
  title           TEXT NOT NULL,
  description     TEXT,
  location        TEXT,
  starts_at       TIMESTAMPTZ NOT NULL,
  ends_at         TIMESTAMPTZ NOT NULL,
  status          shoot_status NOT NULL DEFAULT 'planning',
  created_by      UUID REFERENCES users(id),
  gcal_event_id   TEXT,
  gcal_synced_at  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX idx_shoots_org_time ON photoshoots (organization_id, starts_at);
CREATE INDEX idx_shoots_status   ON photoshoots (organization_id, status);

CREATE TABLE shoot_crew (
  shoot_id UUID NOT NULL REFERENCES photoshoots(id) ON DELETE CASCADE,
  user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (shoot_id, user_id)
);

-- sync queue now serves tasks AND shoots
ALTER TABLE gcal_sync_queue ALTER COLUMN task_id DROP NOT NULL;
ALTER TABLE gcal_sync_queue ADD COLUMN shoot_id UUID REFERENCES photoshoots(id) ON DELETE CASCADE;
ALTER TABLE gcal_sync_queue ADD CONSTRAINT gcal_queue_target CHECK (num_nonnulls(task_id, shoot_id) = 1);

-- updated_at trigger
CREATE TRIGGER photoshoots_updated_at BEFORE UPDATE ON photoshoots
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
