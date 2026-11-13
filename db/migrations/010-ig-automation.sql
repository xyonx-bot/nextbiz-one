-- 010: Instagram automation (Instagram API with Instagram Login).
-- Threads per Instagram user, outbound + echo messages, comment reply tracking,
-- and per-channel switches on keyword rules. Idempotent (deploy re-runs every file).

ALTER TABLE ig_accounts ADD COLUMN IF NOT EXISTS app_scoped_id text;          -- user_id returned by the token exchange
ALTER TABLE ig_accounts ADD COLUMN IF NOT EXISTS profile_picture_url text;
ALTER TABLE ig_accounts ADD COLUMN IF NOT EXISTS webhook_subscribed boolean NOT NULL DEFAULT false;
ALTER TABLE ig_accounts ADD COLUMN IF NOT EXISTS token_refreshed_at timestamptz;
ALTER TABLE ig_accounts ADD COLUMN IF NOT EXISTS last_error text;

CREATE TABLE IF NOT EXISTS ig_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  ig_account_id uuid NOT NULL REFERENCES ig_accounts(id) ON DELETE CASCADE,
  igsid text NOT NULL,                       -- Instagram-scoped id of the customer
  username text,
  name text,
  last_inbound_at timestamptz,
  last_read_at timestamptz,
  automation_paused boolean NOT NULL DEFAULT false,
  automation_paused_at timestamptz,
  welcome_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ig_account_id, igsid)
);
CREATE INDEX IF NOT EXISTS ig_threads_ws_idx ON ig_threads(workspace_id, last_inbound_at DESC);

ALTER TABLE ig_messages ADD COLUMN IF NOT EXISTS thread_id uuid REFERENCES ig_threads(id) ON DELETE CASCADE;
ALTER TABLE ig_messages ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'in';   -- in | out
ALTER TABLE ig_messages ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'received'; -- received | sent | failed
ALTER TABLE ig_messages ADD COLUMN IF NOT EXISTS origin text;                             -- customer | app | ig_app | automation
ALTER TABLE ig_messages ADD COLUMN IF NOT EXISTS error text;
CREATE INDEX IF NOT EXISTS ig_messages_thread_idx ON ig_messages(thread_id, created_at);

ALTER TABLE ig_comments ADD COLUMN IF NOT EXISTS rule_id uuid REFERENCES keyword_rules(id) ON DELETE SET NULL;
ALTER TABLE ig_comments ADD COLUMN IF NOT EXISTS dm_status text;          -- sent | failed | skipped
ALTER TABLE ig_comments ADD COLUMN IF NOT EXISTS public_status text;      -- sent | failed | skipped
ALTER TABLE ig_comments ADD COLUMN IF NOT EXISTS handled_at timestamptz;

ALTER TABLE keyword_rules ADD COLUMN IF NOT EXISTS on_whatsapp boolean NOT NULL DEFAULT true;
ALTER TABLE keyword_rules ADD COLUMN IF NOT EXISTS on_instagram_dm boolean NOT NULL DEFAULT false;
ALTER TABLE keyword_rules ADD COLUMN IF NOT EXISTS on_instagram_comment boolean NOT NULL DEFAULT false;
ALTER TABLE keyword_rules ADD COLUMN IF NOT EXISTS comment_public_reply text;   -- optional public reply under the comment

-- automation log: allow Instagram comment-rule entries
ALTER TABLE automation_log DROP CONSTRAINT IF EXISTS automation_log_type_check;
ALTER TABLE automation_log ADD CONSTRAINT automation_log_type_check
  CHECK (type = ANY (ARRAY['welcome','keyword','away','paused','error','comment']));
