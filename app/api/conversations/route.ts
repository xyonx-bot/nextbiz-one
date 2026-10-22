
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { getPool } from "@/lib/db";

/**
 * GET /api/conversations?q=<search>&unread=1 — P1.6 inbox list:
 * last message preview, contact name/number, unread badge (inbound newer
 * than the operator's read pointer), ordered by recency. Self-gated 401.
 */
export async function GET(req: Request) {
  const token = (await cookies()).get("nbo_session")?.value;
  if (!(await getSessionUser(token))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const unreadOnly = url.searchParams.get("unread") === "1";

  const { rows } = await getPool().query(
    `SELECT c.id, c.last_inbound_at, ct.wa_id, ct.name,
            (SELECT body FROM messages m WHERE m.conversation_id = c.id
              ORDER BY m.created_at DESC LIMIT 1) AS preview,
            (SELECT count(*) FROM messages m
               WHERE m.conversation_id = c.id AND m.direction = 'in'
                 AND m.created_at > COALESCE(c.last_read_at, to_timestamp(0))
            )::int AS unread
       FROM conversations c
       JOIN contacts ct ON ct.id = c.contact_id
      ORDER BY c.last_inbound_at DESC NULLS LAST
      LIMIT 200`,
  );
  const out = rows
    .filter((r) => (unreadOnly ? r.unread > 0 : true))
    .filter((r) => !q || String(r.name ?? "").toLowerCase().includes(q) || String(r.wa_id).includes(q));
  return NextResponse.json({ ok: true, conversations: out });
}
