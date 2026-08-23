-- Cache the connected Instagram account's public profile counts so the
-- merchant feed preview can show the real account without extra API calls.

ALTER TABLE social_accounts ADD COLUMN followers INTEGER;
ALTER TABLE social_accounts ADD COLUMN following INTEGER;
ALTER TABLE social_accounts ADD COLUMN media_count INTEGER;
