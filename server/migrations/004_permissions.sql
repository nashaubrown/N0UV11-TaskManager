-- Per-user capability overrides on top of role defaults, plus Google Drive
-- backup tracking on photos.

CREATE TABLE member_permission_overrides (
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  capability      TEXT NOT NULL,
  allowed         BOOLEAN NOT NULL,             -- true = granted, false = revoked
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id, capability)
);

ALTER TABLE photos ADD COLUMN gdrive_file_id TEXT;
