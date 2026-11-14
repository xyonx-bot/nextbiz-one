import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { getTenant, unauthorized, notFound, isUuid } from "@/lib/tenant";

/** GET /api/contacts?q= — P1.7 list: search by name/number, opt-in state,
 *  last-message preview + time. Self-gated 401. */
export async function GET(req: Request) {
  const tn = await getTenant();
  if (!tn) return unauthorized();
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().toLowerCase();
  const { rows } = await getPool().query(
    `SELECT ct.id, ct.wa_id, ct.name, ct.opt_in, ct.created_at,
            ct.tags, ct.company, ct.location, ct.interested_in, ct.budget,
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
