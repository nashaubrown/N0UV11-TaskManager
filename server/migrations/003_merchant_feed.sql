-- Instagram-style feed planning per merchant.

ALTER TABLE merchants ADD COLUMN ig_handle TEXT;
ALTER TABLE merchants ADD COLUMN bio TEXT;

-- The publish plan: an ordered set of approved photos; position 0 renders
-- top-left (what would be posted last/most recently on Instagram).
CREATE TABLE feed_plan_items (
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  photo_id    UUID NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL DEFAULT 0,
  caption     TEXT,
  added_by    UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (merchant_id, photo_id)
);
CREATE INDEX idx_feed_plan_order ON feed_plan_items (merchant_id, position);
