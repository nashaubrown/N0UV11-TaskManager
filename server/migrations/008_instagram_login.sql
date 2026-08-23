-- Support Meta's "Instagram API with Instagram Login" alongside the
-- Facebook-Page flow: remember which OAuth path a connection used, since
-- syncs hit a different Graph host per kind.

ALTER TABLE social_accounts ADD COLUMN auth_kind TEXT NOT NULL DEFAULT 'facebook';
