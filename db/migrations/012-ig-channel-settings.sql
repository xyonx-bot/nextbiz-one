-- Instagram gets its own welcome/away switches (WhatsApp keeps welcome_*/away_*). Business hours stay shared.
ALTER TABLE automation_settings ADD COLUMN IF NOT EXISTS ig_welcome_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE automation_settings ADD COLUMN IF NOT EXISTS ig_welcome_text text;
ALTER TABLE automation_settings ADD COLUMN IF NOT EXISTS ig_away_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE automation_settings ADD COLUMN IF NOT EXISTS ig_away_text text;
-- comments synced from the Instagram API (not only webhooks); replies the account made in the Instagram app
ALTER TABLE ig_comments ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'webhook';  -- webhook | sync
ALTER TABLE ig_comments ADD COLUMN IF NOT EXISTS owner_reply_text text;
ALTER TABLE ig_comments ADD COLUMN IF NOT EXISTS owner_replied_at timestamptz;
ALTER TABLE ig_accounts ADD COLUMN IF NOT EXISTS comments_synced_at timestamptz;
