-- NextBiz Ads builder: full ad spec on drafts + the Meta ids once published (published campaigns are created PAUSED)
ALTER TABLE ads_mock_campaigns ADD COLUMN IF NOT EXISTS spec jsonb;
ALTER TABLE ads_mock_campaigns ADD COLUMN IF NOT EXISTS meta_campaign_id text;
ALTER TABLE ads_mock_campaigns ADD COLUMN IF NOT EXISTS published_at timestamptz;
