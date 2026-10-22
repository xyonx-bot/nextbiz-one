
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { getPool } from "@/lib/db";

/** GET thread — messages in order + contact + 24h-window state. 401-gated. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const token = (await cookies()).get("nbo_session")?.value;
  if (!(await getSessionUser(token))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const p = getPool();
  const conv = await p.query(
    `SELECT c.id, c.last_inbound_at, ct.id AS contact_id, ct.wa_id, ct.name, ct.opt_in
       FROM conversations c JOIN contacts ct ON ct.id = c.contact_id
      WHERE c.id = $1`,
    [id],
  );
  if (conv.rows.length === 0) return NextResponse.json({ error: "not found" }, { status: 404 });
  const msgs = await p.query(
    `SELECT id, direction, type, body, status, created_at
       FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC LIMIT 500`,
    [id],
  );
  const c = conv.rows[0];
  const hoursSince = c.last_inbound_at
    ? (Date.now() - new Date(c.last_inbound_at).getTime()) / 3600000
    : Infinity;
  return NextResponse.json({
    ok: true,
    conversation: {
      id: c.id, contactId: c.contact_id, waId: c.wa_id, name: c.name,
      optIn: c.opt_in, lastInboundAt: c.last_inbound_at,
      windowOpen: hoursSince < 24,
    },
    messages: msgs.rows,
  });
}
