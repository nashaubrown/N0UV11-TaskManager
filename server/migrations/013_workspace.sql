-- ClickUp-style workspace: task lists filed under merchant folders, plus
-- start dates, per-list custom fields, checklists, photo attachments and
-- time tracking on tasks.

CREATE TABLE task_lists (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  merchant_id     UUID REFERENCES merchants(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  position        INTEGER NOT NULL DEFAULT 0,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_task_lists_org ON task_lists (organization_id, merchant_id, position);

ALTER TABLE tasks ADD COLUMN list_id UUID REFERENCES task_lists(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN starts_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN estimate_minutes INTEGER;
CREATE INDEX idx_tasks_list ON tasks (list_id);

-- custom fields, defined once per list; every task in the list carries them
CREATE TABLE list_fields (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id  UUID NOT NULL REFERENCES task_lists(id) ON DELETE CASCADE,
  name     TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE task_field_values (
  task_id  UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  field_id UUID NOT NULL REFERENCES list_fields(id) ON DELETE CASCADE,
  value    TEXT,
  PRIMARY KEY (task_id, field_id)
);

-- lightweight tick-lists inside a task (separate from subtasks)
CREATE TABLE task_checklist_items (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id  UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  label    TEXT NOT NULL,
  done     BOOLEAN NOT NULL DEFAULT false,
  position INTEGER NOT NULL DEFAULT 0
);

-- photos from the library attached to a task
CREATE TABLE task_attachments (
  task_id  UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  photo_id UUID NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, photo_id)
);

-- time tracking: one open entry per user per task at most
CREATE TABLE task_time_entries (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at   TIMESTAMPTZ,
  seconds    INTEGER
);
CREATE INDEX idx_time_entries_task ON task_time_entries (task_id);
