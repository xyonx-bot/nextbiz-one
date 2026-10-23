import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { sendText } from "@/lib/wa-client";

/**
 * POST — free-text reply. The 24h messaging window is enforced SERVER-side
 * (plan §2): outside the window free text is rejected — the UI shows the
 * blocked state and a template prompt instead.
 */
const Body = z.object({ body: z.string().trim().min(1).max(4096) });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const token = (await cookies()).get("nbo_session")?.value;
  if (!(await getSessionUser(token))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  let parsed: unknown;
  try { parsed = await req.json(); } catch { return NextResponse.json({ error: "malformed" }, { status: 400 }); }
  const b = Body.safeParse(parsed);
  if (!b.success) return NextResponse.json({ error: "Message text is required." }, { status: 400 });

  const p = getPool();
  const conv = await p.query(
    `SELECT c.id, c.last_inbound_at, ct.wa_id, ct.opt_in
       FROM conversations c JOIN contacts ct ON ct.id = c.contact_id
      WHERE c.id = $1`,
    [id],
  );
  if (conv.rows.length === 0) return NextResponse.json({ error: "not found" }, { status: 404 });
  const c = conv.rows[0];
  const hoursSince = c.last_inbound_at
    ? (Date.now() - new Date(c.last_inbound_at).getTime()) / 3600000
    : Infinity;
  if (hoursSince >= 24) {
    return NextResponse.json(
      { error: "Free-text is blocked — send an approved template to restart the conversation.", window: "closed" },
      { status: 403 },
    );
  }

  const send = await sendText(c.wa_id, b.data.body);
  if (!send.ok) return NextResponse.json({ error: send.error, metaCode: send.metaCode }, { status: 502 });

  const r = await p.query(
    `INSERT INTO messages (workspace_id, conversation_id, direction, wa_message_id, type, body, status, raw)
     VALUES ($1, $2, 'out', $3, 'text', $4, 'sent', '{}'::jsonb)
     ON CONFLICT DO NOTHING
     RETURNING id, created_at, status`,
    [(await p.query(`SELECT workspace_id FROM conversations WHERE id = $1`, [id])).rows[0].workspace_id,
     id, send.waMessageId, b.data.body],
  );
  return NextResponse.json({ ok: true, message: r.rows[0] });
}
