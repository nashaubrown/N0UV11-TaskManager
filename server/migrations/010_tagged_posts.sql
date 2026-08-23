-- Media the account is tagged in (Instagram's "tagged" tab — includes
-- collaborative posts authored by other accounts).

ALTER TABLE social_posts ADD COLUMN is_tagged BOOLEAN NOT NULL DEFAULT false;
