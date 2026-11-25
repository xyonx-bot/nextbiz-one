-- 020: one row per Instagram message, encrypted Instagram tokens, comment moderation. Idempotent.

-- Instagram gives one message two ids: the webhook sends "new_ig_dm_item:1:IGMessageID:<account>:<thread>:<id>", the
-- Conversations API sends "ig_dm_item:1:IGMessageID:…" for the same message (base64, with Z escaped: ZA=Z ZB=+ ZC=/ ZD='=').
-- The part after "IGMessageID:" is the message; ids in any other shape are their own key. Never throws.
CREATE OR REPLACE FUNCTION nbo_ig_mid_key(mid text) RETURNS text LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE s text; t text;
BEGIN
  -- ZA last: every Z in an id starts an escape, so undoing it earlier could create false ones
  s := rtrim(replace(replace(replace(replace(mid, 'ZB', '+'), 'ZC', '/'), 'ZD', '='), 'ZA', 'Z'), '=');
  t := convert_from(decode(s || repeat('=', (4 - length(s) % 4) % 4), 'base64'), 'UTF8');
  RETURN CASE WHEN t ~ '^(new_)?ig_dm_item:[0-9]+:IGMessageID:.' THEN 'ig:' || regexp_replace(t, '^.*IGMessageID:', '') ELSE mid END;
EXCEPTION WHEN OTHERS THEN RETURN mid;
END $$;

ALTER TABLE ig_messages ADD COLUMN IF NOT EXISTS mid_key text GENERATED ALWAYS AS (nbo_ig_mid_key(mid)) STORED;

-- merge the copies that already exist: keep the row that knows more (sent by the app/automation, has text), then the oldest
DELETE FROM ig_messages d USING (
  SELECT id, row_number() OVER (PARTITION BY mid_key ORDER BY
           (origin IN ('app','automation')) DESC NULLS LAST, (body IS NOT NULL) DESC, created_at, id) AS n
    FROM ig_messages) r
 WHERE r.id = d.id AND r.n > 1;
CREATE UNIQUE INDEX IF NOT EXISTS ig_messages_mid_key_uq ON ig_messages (mid_key);

-- Instagram tokens at rest (AES-256-GCM, same as WhatsApp). The app moves old plain-text tokens over when it starts.
ALTER TABLE ig_accounts ADD COLUMN IF NOT EXISTS access_token_enc bytea;

-- comments hidden on Instagram itself (hidden_at = only dismissed inside NextBiz One)
ALTER TABLE ig_comments ADD COLUMN IF NOT EXISTS ig_hidden_at timestamptz;
