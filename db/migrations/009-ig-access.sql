-- 009: Instagram access prep (P3 backend wiring; MOCK-BADGED until Meta app
-- review approves instagram_business_* permissions — same pattern as
-- 008-ads-mock). Raw webhook envelopes + parsed DM/comment rows persist
-- locally; ingest is idempotent on Meta event ids. When live IG Graph access
-- exists (IG_LIVE=true + real IG_APP_ID/IG_APP_SECRET), the connect flow
-- exchanges the short-lived IG user token for a long-lived one and stores it
-- here — same API shape, no client rewrite.
CREATE TABLE IF NOT EXISTS ig_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  ig_user_id text NOT NULL,               -- IG account id from /me
  username text,
  display_name text,
  access_token text,                      -- long-lived token; NULL in mock mode
  scopes text[] NOT NULL DEFAULT '{}',
  expires_at timestamptz,
  live boolean NOT NULL DEFAULT false,    -- false = mock-badged
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, ig_user_id)
);

CREATE TABLE IF NOT EXISTS ig_webhook_events (
  id bigserial PRIMARY KEY,
  ig_event_id text UNIQUE,                -- envelope dedupe (Meta retries on non-2xx)
  body jsonb NOT NULL,
  signature_valid boolean NOT NULL DEFAULT false,
  processed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ig_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  ig_account_id uuid NOT NULL REFERENCES ig_accounts(id) ON DELETE CASCADE,
  mid text UNIQUE NOT NULL,               -- Meta message id — idempotent ingest
  sender_id text NOT NULL,
  sender_name text,
  body text,
  raw jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ig_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ig_account_id uuid NOT NULL REFERENCES ig_accounts(id) ON DELETE CASCADE,
  comment_id text UNIQUE NOT NULL,
  from_id text,
  from_name text,
  media_id text,
  text text,
  raw jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ig_audit (
  id bigserial PRIMARY KEY,
  workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  action text NOT NULL,
  detail jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ig_messages_account_idx ON ig_messages(ig_account_id);
CREATE INDEX IF NOT EXISTS ig_comments_account_idx ON ig_comments(ig_account_id);
