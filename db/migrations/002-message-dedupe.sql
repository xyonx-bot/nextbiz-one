-- 002: message dedupe — Meta retries webhooks on gaps; same wa_message_id
-- must land exactly once. The S0 insert already had ON CONFLICT DO NOTHING,
-- but there was no unique constraint for it to conflict ON (only an index).
CREATE UNIQUE INDEX IF NOT EXISTS messages_wa_unique
  ON messages (wa_message_id) WHERE wa_message_id IS NOT NULL;
