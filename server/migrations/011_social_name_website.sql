-- The account's display name and website, for a faithful profile header
-- in the feed preview.

ALTER TABLE social_accounts ADD COLUMN display_name TEXT;
ALTER TABLE social_accounts ADD COLUMN website TEXT;
