-- NextBiz Ads: one Meta ad account per workspace (Marketing API). Token encrypted (APP_ENCRYPTION_KEY);
-- the platform owner's workspace may use the server's system-user token instead (uses_system_token).
CREATE TABLE IF NOT EXISTS ads_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
  ad_account_id text NOT NULL,              -- "act_123…"
  name text,
  currency text,
  timezone text,
  token_enc bytea,
  uses_system_token boolean NOT NULL DEFAULT false,
  token_expires_at timestamptz,
  connected_by text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
