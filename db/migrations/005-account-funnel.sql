-- 005 (S3 / P1.1-P1.3): access requests (the gate before a workspace
-- exists), append-only audit ledger, workspace revoke state. Idempotent.

CREATE TABLE IF NOT EXISTS access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name text NOT NULL,
  use_description text NOT NULL,          -- the actual review material
  email text NOT NULL,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,  -- set when signup created the account
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reject_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  UNIQUE (email, status, created_at)      -- allows re-submit after rejection
);

CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_email text NOT NULL,             -- operator identity per entry
  action text NOT NULL CHECK (action IN ('request_received','approved','rejected','revoked','restored')),
  target text NOT NULL,                  -- business name / workspace identity
  reason text,                           -- required for reject/revoke
  created_at timestamptz NOT NULL DEFAULT now()
);
-- append-only: no UPDATE/DELETE paths exist in the app; revoke grants too.
REVOKE UPDATE, DELETE ON audit_log FROM PUBLIC;

ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS revoked boolean NOT NULL DEFAULT false;
