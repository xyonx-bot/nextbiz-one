-- Instagram DMs pulled from the API (until live webhooks arrive after App Review)
ALTER TABLE ig_accounts ADD COLUMN IF NOT EXISTS dms_synced_at timestamptz;
