-- 017: template headers/buttons, stored media, manual contacts, Instagram profile pictures. Idempotent.

-- files people upload (template header samples). Small (≤16 MB) so Postgres holds them.
CREATE TABLE IF NOT EXISTS media_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  mime text NOT NULL,
  size int NOT NULL,
  bytes bytea NOT NULL,
  wa_media_id text,            -- WhatsApp media id for sending (valid ~30 days)
  wa_media_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS media_files_ws_idx ON media_files (workspace_id);

-- header: NONE | TEXT | IMAGE | VIDEO | DOCUMENT (existing `header` text column keeps the TEXT header)
ALTER TABLE templates ADD COLUMN IF NOT EXISTS header_format text NOT NULL DEFAULT 'NONE';
ALTER TABLE templates ADD COLUMN IF NOT EXISTS header_media_id uuid REFERENCES media_files(id) ON DELETE SET NULL;
-- [{type: QUICK_REPLY|URL|PHONE_NUMBER, text, url?, phone?}]
ALTER TABLE templates ADD COLUMN IF NOT EXISTS buttons_json jsonb NOT NULL DEFAULT '[]'::jsonb;

-- where a contact came from: whatsapp (they messaged) | manual | import
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'whatsapp';

-- Instagram profile picture (Meta's CDN url expires — refreshed on demand)
ALTER TABLE ig_threads ADD COLUMN IF NOT EXISTS profile_pic text;
ALTER TABLE ig_threads ADD COLUMN IF NOT EXISTS profile_pic_at timestamptz;

-- template messages sent to one person from the inbox / contacts
ALTER TABLE messages ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES templates(id) ON DELETE SET NULL;

-- which device a session belongs to (Settings → Active sessions)
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS user_agent text;
