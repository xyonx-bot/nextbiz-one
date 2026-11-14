import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { getTenant, unauthorized } from "@/lib/tenant";
import { cleanTags, normalizePhone, upsertContacts } from "@/lib/contacts";

/** GET /api/contacts?q= — P1.7 list: search by name/number, opt-in state,
 *  last-message preview + time. Self-gated 401. */
export async function GET(req: Request) {
  const tn = await getTenant();
  if (!tn) return unauthorized();
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().toLowerCase();
  const { rows } = await getPool().query(
    `SELECT ct.id, ct.wa_id, ct.name, ct.opt_in, ct.created_at,
            ct.tags, ct.company, ct.location, ct.interested_in, ct.budget, ct.source,
            (SELECT m.body FROM messages m
               JOIN conversations c ON c.id = m.conversation_id
              WHERE c.contact_id = ct.id ORDER BY m.created_at DESC LIMIT 1) AS preview,
            (SELECT c2.last_inbound_at FROM conversations c2
              WHERE c2.contact_id = ct.id LIMIT 1) AS last_at,
            (SELECT c2.id FROM conversations c2
              WHERE c2.contact_id = ct.id LIMIT 1) AS conv_id
       FROM contacts ct
      WHERE ct.workspace_id = $1
       ORDER BY COALESCE((SELECT c2.last_inbound_at FROM conversations c2
                            WHERE c2.contact_id = ct.id LIMIT 1), ct.created_at) DESC
       LIMIT 500`, [tn.wsId],
  );
  const out = rows.filter(
    (r) => !q || String(r.name ?? "").toLowerCase().includes(q) || String(r.wa_id).includes(q),
  );
  return NextResponse.json({ ok: true, contacts: out });
}

const One = z.object({
  phone: z.string().trim().min(5).max(40), name: z.string().trim().max(120).optional(), tags: z.union([z.string(), z.array(z.string())]).optional(),
  company: z.string().trim().max(120).optional(), optIn: z.boolean().optional(), consent: z.boolean().optional(), defaultCc: z.string().regex(/^\d{1,4}$/).default("91"),
});

/** POST — add one contact by hand. Opt-in only with the person's recorded consent. */
export async function POST(req: Request) {
  const tn = await getTenant();
  if (!tn) return unauthorized();
  const b = One.safeParse(await req.json().catch(() => null));
  if (!b.success) return NextResponse.json({ error: "Enter a phone number." }, { status: 400 });
  const phone = normalizePhone(b.data.phone, b.data.defaultCc);
  if (!phone) return NextResponse.json({ error: "That doesn't look like a WhatsApp number — include the country code, e.g. +91 98765 43210." }, { status: 400 });
  const r = await upsertContacts(tn.wsId, [{ phone, name: b.data.name, tags: cleanTags(b.data.tags ?? []), company: b.data.company, optIn: b.data.optIn }], "manual", !!b.data.consent);
  const row = (await getPool().query(`SELECT id, wa_id, name, opt_in, created_at, tags, company, location, interested_in, budget, source FROM contacts WHERE workspace_id = $1 AND wa_id = $2`, [tn.wsId, phone])).rows[0];
  return NextResponse.json({ ok: true, existed: r.updated > 0, contact: { ...row, preview: null, last_at: null, conv_id: null } }, { status: r.added ? 201 : 200 });
}
