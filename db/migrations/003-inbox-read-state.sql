-- 003 (S1 / P1.6): message delivery+read states + conversation read pointer.
-- Meta statuses webhook updates messages.status (sent→delivered→read / failed);
-- conversations.last_read_at drives the unread badge (inbound newer than the
-- operator's read pointer = unread). Idempotent.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS status text
  NOT NULL DEFAULT 'received' CHECK (status IN ('received','sent','delivered','read','failed'));
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_read_at timestamptz;
CREATE INDEX IF NOT EXISTS conversations_unread_idx
  ON conversations (workspace_id, last_inbound_at DESC);
