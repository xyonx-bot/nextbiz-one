import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { getPool } from "@/lib/db";

/** P1.4 — wizard state: connection + display-name-review + live-test rows. */
export async function GET() {
  const token = (await cookies()).get("nbo_session")?.value;
  const u = await getSessionUser(token);
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const p = getPool();

  const wc = await p.query(`SELECT phone_number_id, display_name, status FROM waba_connections LIMIT 1`);
  const w = wc.rows[0] ?? null;
  const connected = !!w && w.status === "connected";

  // live-test receive row: any inbound from our own number after a send?
  const own = w?.display_name?.match(/\+?\d[\d ]{9,}/)?.[0]?.replace(/\D/g, "");
  let testReceived = false, testSentAt: string | null = null;
  if (own) {
    const t = await p.query(
      `SELECT (SELECT count(*)::int FROM messages m JOIN conversations c ON c.id=m.conversation_id
                JOIN contacts ct ON ct.id=c.contact_id
                WHERE ct.wa_id=$1 AND m.direction='in' AND m.created_at > now() - interval '30 minutes') AS recv,
              (SELECT max(created_at)::text FROM messages m JOIN conversations c ON c.id=m.conversation_id
                JOIN contacts ct ON ct.id=c.contact_id
                WHERE ct.wa_id=$1 AND m.direction='out' AND m.created_at > now() - interval '30 minutes') AS sent`,
      [own],
    );
    testReceived = (t.rows[0]?.recv ?? 0) > 0;
    testSentAt = t.rows[0]?.sent ?? null;
  }
  return NextResponse.json({
    ok: true, connected,
    displayNumber: own ? `+${own.slice(0, 2)} ${own.slice(2, 7)}XXXXXX${own.slice(-2)}` : null,
    testSent: !!testSentAt, testReceived,
  });
}
