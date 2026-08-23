-- Cache the connected Instagram account's profile picture and bio so the
-- feed preview can render the real profile header.

ALTER TABLE social_accounts ADD COLUMN profile_picture_url TEXT;
ALTER TABLE social_accounts ADD COLUMN biography TEXT;
