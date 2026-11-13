import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { getPool } from "@/lib/db";

/** GET — one Instagram thread: messages + 24h window + automation state. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await getSessionUser((await cookies()).get("nbo_session")?.value))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const p = getPool();
  const t = (await p.query(
    `SELECT t.*, a.username AS account_username, a.live AS account_live FROM ig_threads t JOIN ig_accounts a ON a.id = t.ig_account_id WHERE t.id = $1`, [id])).rows[0];
  if (!t) return NextResponse.json({ error: "not found" }, { status: 404 });
  const msgs = await p.query(
    `SELECT id, direction, body, status, origin, error, created_at FROM ig_messages WHERE thread_id = $1 ORDER BY created_at ASC LIMIT 500`, [id]);
  const hours = t.last_inbound_at ? (Date.now() - new Date(t.last_inbound_at).getTime()) / 3600000 : Infinity;
  return NextResponse.json({
    ok: true,
    thread: {
      id: t.id, igsid: t.igsid, username: t.username, name: t.name, lastInboundAt: t.last_inbound_at, windowOpen: hours < 24,
      automationPaused: t.automation_paused, automationPausedAt: t.automation_paused_at, createdAt: t.created_at,
      accountUsername: t.account_username, accountLive: t.account_live,
    },
    messages: msgs.rows,
  }, { headers: { "Cache-Control": "no-store" } });
}
