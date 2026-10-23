-- 004 (S2 / P1.8-P1.9): templates, broadcasts, per-recipient delivery rows,
-- and the jobs table for the in-app scheduler (plan D2 — no Redis/pg-boss).
-- workspace_id on every domain table. Idempotent.

CREATE TABLE IF NOT EXISTS templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,                      -- human name (wireframe row label)
  meta_name text,                           -- normalized name sent to Meta
  category text NOT NULL DEFAULT 'MARKETING' CHECK (category IN ('MARKETING','UTILITY')),
  language text NOT NULL DEFAULT 'en_IN',
  body text NOT NULL,                       -- {{1}} {{2}} variable placeholders
  variables text[] NOT NULL DEFAULT '{}',  -- ordered variable meanings
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending','approved','rejected')),
  meta_template_id text,                    -- Meta's id after submit
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, name)
);

CREATE TABLE IF NOT EXISTS broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES templates(id) ON DELETE RESTRICT,
  name text NOT NULL,
  audience_filter jsonb NOT NULL DEFAULT '{}'::jsonb,  -- {tag?: string, optInOnly: true}
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','sending','done','failed','cancelled')),
  scheduled_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, name)
);

CREATE TABLE IF NOT EXISTS broadcast_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id uuid NOT NULL REFERENCES broadcasts(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','delivered','read','failed','skipped')),
  wa_message_id text,
  error_code int,
  error_raw text,
  sent_at timestamptz,
  UNIQUE (broadcast_id, contact_id)        -- idempotency is a constraint, not an index
);

CREATE TABLE IF NOT EXISTS jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid,
  type text NOT NULL CHECK (type IN ('broadcast_send','template_status_poll')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','failed')),
  run_at timestamptz NOT NULL DEFAULT now(),
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS jobs_due_idx ON jobs (status, run_at);
