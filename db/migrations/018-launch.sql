-- 018: public-launch plumbing. Idempotent.

-- Meta data-deletion callbacks (Facebook Login + Instagram Login): one row per request, status shown on /data-deletion?code=
CREATE TABLE IF NOT EXISTS data_deletion_requests (
  code text PRIMARY KEY,                    -- confirmation code returned to Meta
  source text NOT NULL,                     -- facebook | instagram | user
  meta_user_id text,
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received','completed','nothing_found')),
  detail text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

-- password reset: a user asks, the operator creates a one-time link (no email service yet)
CREATE TABLE IF NOT EXISTS password_resets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text,                          -- sha256 of the link token; NULL until the operator creates the link
  requested_at timestamptz NOT NULL DEFAULT now(),
  link_created_at timestamptz,
  expires_at timestamptz,
  used_at timestamptz
);
CREATE INDEX IF NOT EXISTS password_resets_open_idx ON password_resets (used_at, requested_at DESC);
