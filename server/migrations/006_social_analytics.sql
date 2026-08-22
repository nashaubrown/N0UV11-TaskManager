-- Instagram analytics (Metricool-style): account connections, daily metric
-- snapshots, per-post performance, and audience-online times — plus a
-- scheduled slot on feed plan items for the content planner.

CREATE TABLE social_accounts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  merchant_id      UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  platform         TEXT NOT NULL DEFAULT 'instagram',
  ig_user_id       TEXT NOT NULL,
  username         TEXT,
  access_token     TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ,
  connected_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  connected_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_synced_at   TIMESTAMPTZ,
  UNIQUE (merchant_id, platform)
);
CREATE INDEX idx_social_accounts_org ON social_accounts (organization_id);

CREATE TABLE social_metrics_daily (
  account_id     UUID NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
  day            DATE NOT NULL,
  followers      INTEGER,
  media_count    INTEGER,
  reach          INTEGER,
  impressions    INTEGER,
  profile_views  INTEGER,
  website_clicks INTEGER,
  PRIMARY KEY (account_id, day)
);

CREATE TABLE social_posts (
  account_id     UUID NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
  ig_media_id    TEXT NOT NULL,
  caption        TEXT,
  media_type     TEXT,
  thumbnail_url  TEXT,
  permalink      TEXT,
  posted_at      TIMESTAMPTZ,
  like_count     INTEGER,
  comments_count INTEGER,
  reach          INTEGER,
  saved          INTEGER,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, ig_media_id)
);
CREATE INDEX idx_social_posts_time ON social_posts (account_id, posted_at DESC);

-- Audience online heatmap: strength per (day-of-week, hour). 0 = Sunday.
CREATE TABLE social_online_times (
  account_id UUID NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
  dow        SMALLINT NOT NULL,
  hour       SMALLINT NOT NULL,
  value      DOUBLE PRECISION NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, dow, hour)
);

ALTER TABLE feed_plan_items ADD COLUMN scheduled_at TIMESTAMPTZ;
