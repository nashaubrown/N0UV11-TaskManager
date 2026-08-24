-- Photoshoots join the workspace: a shoot can belong to a task list, and
-- keeps an auto-synced "shoot task" in that list.

ALTER TABLE photoshoots ADD COLUMN list_id UUID REFERENCES task_lists(id) ON DELETE SET NULL;
ALTER TABLE photoshoots ADD COLUMN linked_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL;
