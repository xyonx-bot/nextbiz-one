-- 006 (S4 / P1.10 + P0 settings): automation engine tables + workspace
-- profile fields. Idempotent. No regex/AI — contains-match only (v1 lock).

CREATE TABLE IF NOT EXISTS automation_settings (
  workspace_id uuid PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  welcome_enabled boolean NOT NULL DEFAULT true,
  welcome_text text NOT NULL DEFAULT 'Hi! Thanks for reaching out — we usually reply within a day.',
  away_enabled boolean NOT NULL DEFAULT false,
  away_text text,
  business_hours jsonb NOT NULL DEFAULT '{}'::jsonb,  -- {mon:["09:00","18:00"],...}
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS keyword_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  keywords text[] NOT NULL DEFAULT '{}',
  reply text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  send_once boolean NOT NULL DEFAULT true,
  fired_count int NOT NULL DEFAULT 0,
  last_fired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, name)
);

CREATE TABLE IF NOT EXISTS faq_pairs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  question text NOT NULL,
  answer text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- append-only event log (last 50 surfaced in UI; no pagination v1)
CREATE TABLE IF NOT EXISTS automation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('welcome','keyword','away','paused','error')),
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  rule_id uuid REFERENCES keyword_rules(id) ON DELETE SET NULL,
  detail text,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','delivered','failed','skipped','paused')),
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE UPDATE, DELETE ON automation_log FROM PUBLIC;

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS automation_paused boolean NOT NULL DEFAULT false;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS welcome_sent_at timestamptz;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS about text;
