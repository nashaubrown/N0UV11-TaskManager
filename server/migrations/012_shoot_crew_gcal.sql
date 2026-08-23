-- Per-user Google Calendar events for shoots: every tagged crew member with
-- a connected Google account gets the event in their own calendar.

CREATE TABLE shoot_gcal_events (
  shoot_id  UUID NOT NULL REFERENCES photoshoots(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id  TEXT NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (shoot_id, user_id)
);

-- carry over events created under the old single-event model
INSERT INTO shoot_gcal_events (shoot_id, user_id, event_id)
  SELECT id, created_by, gcal_event_id FROM photoshoots
  WHERE gcal_event_id IS NOT NULL AND created_by IS NOT NULL;

ALTER TABLE photoshoots DROP COLUMN gcal_event_id;
