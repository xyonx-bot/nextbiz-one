import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { getTenant, unauthorized } from "@/lib/tenant";

/** GET — DM threads of the connected Instagram account for the inbox (same shape as /api/conversations + channel). */
export async function GET() {
  const tn = await getTenant();
  if (!tn) return unauthorized();
  const { rows } = await getPool().query(
    `SELECT t.id, t.igsid, t.username, t.name, t.last_inbound_at, lm.body AS preview, lm.direction AS last_direction,
            lm.status AS last_status, lm.created_at AS last_at, a.username AS account_username, a.live AS account_live,
            (SELECT count(*)::int FROM ig_messages m WHERE m.thread_id = t.id AND m.direction = 'in'
               AND m.created_at > COALESCE(t.last_read_at, to_timestamp(0))) AS unread
       FROM ig_threads t JOIN ig_accounts a ON a.id = t.ig_account_id
       LEFT JOIN LATERAL (SELECT body, direction, status, created_at FROM ig_messages m WHERE m.thread_id = t.id ORDER BY created_at DESC LIMIT 1) lm ON true
      WHERE t.workspace_id = $1 AND a.live
      ORDER BY COALESCE(lm.created_at, t.last_inbound_at) DESC NULLS LAST LIMIT 200`, [tn.wsId],
  );
  return NextResponse.json({ ok: true, threads: rows }, { headers: { "Cache-Control": "no-store" } });
}
