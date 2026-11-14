/** Phone normalising + contact upserts for manual add and CSV import. */
import { getPool } from "./db";

/** "+91 98765-43210", "098765 43210", "9876543210" → "919876543210" (default country when no code). */
export function normalizePhone(raw: string, defaultCc = "91"): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  let d = s.replace(/[^\d+]/g, "");
  if (d.startsWith("+")) d = d.slice(1).replace(/\D/g, "");
  else if (d.startsWith("00")) d = d.slice(2);
  else {
    d = d.replace(/\D/g, "").replace(/^0+/, "");
    if (d.length <= 10) d = defaultCc + d;
  }
  return /^\d{8,15}$/.test(d) ? d : null;
}

export const cleanTags = (tags: unknown): string[] =>
  [...new Set((Array.isArray(tags) ? tags : String(tags ?? "").split(/[;,|]/)).map((t) => String(t).trim().toLowerCase().slice(0, 32)).filter(Boolean))].slice(0, 10);

export type NewContact = { phone: string; name?: string | null; tags?: string[]; optIn?: boolean; company?: string | null; location?: string | null };

/** Insert or merge (fills empty fields, adds tags; never removes an opt-in, never adds one without consent). */
export async function upsertContacts(wsId: string, rows: NewContact[], source: "manual" | "import", consent: boolean) {
  const p = getPool();
  let added = 0, updated = 0;
  for (const r of rows) {
    const res = await p.query(
      `INSERT INTO contacts (workspace_id, wa_id, name, tags, opt_in, company, location, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (workspace_id, wa_id) DO UPDATE SET
         name = COALESCE(contacts.name, EXCLUDED.name),
         tags = (SELECT ARRAY(SELECT DISTINCT unnest(contacts.tags || EXCLUDED.tags))),
         opt_in = contacts.opt_in OR EXCLUDED.opt_in,
         company = COALESCE(contacts.company, EXCLUDED.company),
         location = COALESCE(contacts.location, EXCLUDED.location)
       RETURNING id, (xmax = 0) AS inserted`,
      [wsId, r.phone, r.name?.trim() || null, r.tags ?? [], consent && !!r.optIn, r.company?.trim() || null, r.location?.trim() || null, source]);
    if (res.rows[0]?.inserted) added++; else updated++;
  }
  return { added, updated };
}
