import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { getTenant, unauthorized } from "@/lib/tenant";

/** P1.4 — wizard state: connection + display-name-review + live-test rows. */
export async function GET() {
  const tn = await getTenant();
  if (!tn) return unauthorized();
  const p = getPool();

  const wc = await p.query(`SELECT phone_number_id, display_name, status FROM waba_connections WHERE workspace_id = $1 ORDER BY (status = 'connected') DESC, created_at DESC LIMIT 1`, [tn.wsId]);
  const w = wc.rows[0] ?? null;
  const connected = !!w && w.status === "connected";

  // live-test receive row: any inbound from our own number after a send?
  const own = w?.display_name?.match(/\+?\d[\d ]{9,}/)?.[0]?.replace(/\D/g, "");
  let testReceived = false, testSentAt: string | null = null;
  if (own) {
    const t = await p.query(
      `SELECT (SELECT count(*)::int FROM messages m JOIN conversations c ON c.id=m.conversation_id
                JOIN contacts ct ON ct.id=c.contact_id
                WHERE ct.wa_id=$1 AND ct.workspace_id=$2 AND m.direction='in' AND m.created_at > now() - interval '30 minutes') AS recv,
              (SELECT max(m.created_at)::text FROM messages m JOIN conversations c ON c.id=m.conversation_id
                JOIN contacts ct ON ct.id=c.contact_id
                WHERE ct.wa_id=$1 AND ct.workspace_id=$2 AND m.direction='out' AND m.created_at > now() - interval '30 minutes') AS sent`,
      [own, tn.wsId],
    );
    testReceived = (t.rows[0]?.recv ?? 0) > 0;
    testSentAt = t.rows[0]?.sent ?? null;
  }
  const counts = (await p.query(
    `SELECT (SELECT count(*)::int FROM messages WHERE workspace_id = $1 AND direction = 'in') AS inbound,
            (SELECT count(*)::int FROM templates WHERE workspace_id = $1 AND lower(status) = 'approved') AS approved`, [tn.wsId],
  )).rows[0];
  return NextResponse.json({
    ok: true, connected, displayName: w?.display_name ?? null,
    inboundCount: counts?.inbound ?? 0, approvedTemplates: counts?.approved ?? 0,
    displayNumber: own ? `+${own.slice(0, 2)} ${own.slice(2, 7)}XXXXXX${own.slice(-2)}` : null,
    testSent: !!testSentAt, testReceived,
  });
}
