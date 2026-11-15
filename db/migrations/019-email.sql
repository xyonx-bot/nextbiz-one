-- 019: automatic email. Idempotent.
CREATE TABLE IF NOT EXISTS email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  to_email text NOT NULL,
  kind text NOT NULL,                      -- reset | request_received | request_new | approved | rejected | digest | test
  subject text NOT NULL,
  status text NOT NULL CHECK (status IN ('sent','failed','skipped')),
  provider text,                           -- resend | smtp | none
  provider_id text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_log_created_idx ON email_log (created_at DESC);

-- per-user email preferences (morning summary of waiting chats)
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_digest boolean NOT NULL DEFAULT true;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS digest_sent_on date;

-- approval of a request made without an account: remember the workspace so sign-up joins it
ALTER TABLE access_requests ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE SET NULL;
ALTER TABLE password_resets ADD COLUMN IF NOT EXISTS emailed_at timestamptz;
