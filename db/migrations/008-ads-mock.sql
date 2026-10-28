-- 008: Ads module (P2) — persistence for user-created campaign drafts.
-- The module ships MOCK-BADGED (Meta permission audit Oct 27: business has
-- zero ad accounts, system-user token has no ads_read/ads_management), so
-- every campaign the operator creates lives here until live Graph access
-- exists. The /api/ads/* routes merge these rows with deterministic demo
-- fixtures; when a real ad account + ads_read arrive, this table is
-- replaced by real campaign sync — same API shape, no client rewrite.
CREATE TABLE IF NOT EXISTS ads_mock_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  objective text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  daily_budget integer NOT NULL CHECK (daily_budget >= 0),
  start_time timestamptz,
  stop_time timestamptz,
  destination text,
  creative_headline text,
  creative_body text,
  audience text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ads_mock_campaigns_ws_idx ON ads_mock_campaigns(workspace_id);
