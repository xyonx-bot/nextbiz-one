-- NextBiz Social: manual comment replies from the Comments page (idempotent)
ALTER TABLE ig_comments ADD COLUMN IF NOT EXISTS reply_text text;
ALTER TABLE ig_comments ADD COLUMN IF NOT EXISTS reply_kind text;          -- public | private
ALTER TABLE ig_comments ADD COLUMN IF NOT EXISTS replied_at timestamptz;
ALTER TABLE ig_comments ADD COLUMN IF NOT EXISTS hidden_at timestamptz;    -- dismissed from "Needs reply"
CREATE INDEX IF NOT EXISTS ig_comments_account_created_idx ON ig_comments(ig_account_id, created_at DESC);
