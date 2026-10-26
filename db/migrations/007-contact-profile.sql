-- 007-contact-profile.sql
-- Additive profile fields powering the wireframe detail panels (Contacts +
-- Inbox contact panel): tags, company, location, interested-in, budget.
-- Safe idempotent ALTERs — v1 has no edit flow yet, so null → "—" (mut
-- state from the wireframes). Templates gain header/buttons/footer columns
-- for the wireframe editor rows (display-only; Meta owns submitted content).

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS company text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS location text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS interested_in text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS budget text;

ALTER TABLE templates ADD COLUMN IF NOT EXISTS header text;
ALTER TABLE templates ADD COLUMN IF NOT EXISTS buttons text;
ALTER TABLE templates ADD COLUMN IF NOT EXISTS footer text;
