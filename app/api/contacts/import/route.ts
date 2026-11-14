import { NextResponse } from "next/server";
import { z } from "zod";
import { getTenant, unauthorized } from "@/lib/tenant";
import { cleanTags, normalizePhone, upsertContacts, type NewContact } from "@/lib/contacts";

/**
 * POST { rows: [{phone, name?, tags?, optIn?, company?, location?}], defaultCc, consent, tags? }
 * The browser parses the CSV and maps columns; the server re-validates every number.
 */
const Body = z.object({
  rows: z.array(z.object({ phone: z.string().max(40), name: z.string().max(120).nullable().optional(), tags: z.union([z.string().max(300), z.array(z.string())]).nullable().optional(),
    optIn: z.boolean().optional(), company: z.string().max(120).nullable().optional(), location: z.string().max(120).nullable().optional() })).min(1).max(5000),
  defaultCc: z.string().regex(/^\d{1,4}$/).default("91"),
  consent: z.boolean().default(false),
  tags: z.array(z.string()).max(5).optional(),
});

export async function POST(req: Request) {
  const t = await getTenant();
  if (!t) return unauthorized();
  const b = Body.safeParse(await req.json().catch(() => null));
  if (!b.success) return NextResponse.json({ error: b.error.issues[0]?.message ?? "Nothing to import." }, { status: 400 });
  const extra = cleanTags(b.data.tags ?? []);
  const seen = new Set<string>(); const good: NewContact[] = []; const bad: { row: number; phone: string }[] = [];
  b.data.rows.forEach((r, i) => {
    const phone = normalizePhone(r.phone, b.data.defaultCc);
    if (!phone) { bad.push({ row: i + 1, phone: r.phone }); return; }
    if (seen.has(phone)) return; seen.add(phone);
    good.push({ phone, name: r.name, tags: cleanTags([...cleanTags(r.tags ?? []), ...extra]), optIn: r.optIn, company: r.company, location: r.location });
  });
  const res = await upsertContacts(t.wsId, good, "import", b.data.consent);
  return NextResponse.json({ ok: true, ...res, skipped: bad.length, invalid: bad.slice(0, 20), duplicates: b.data.rows.length - good.length - bad.length });
}
