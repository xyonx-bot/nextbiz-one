import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { igSendDm, recordOutbound } from "@/lib/instagram";

/**
 * POST — reply to an Instagram DM. Instagram's 24-hour messaging window is enforced server-side.
 * A person replying pauses automation for this thread (same contract as WhatsApp).
 */
const Body = z.object({ body: z.string().trim().min(1).max(1000) });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await getSessionUser((await cookies()).get("nbo_session")?.value))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const b = Body.safeParse(await req.json().catch(() => null));
  if (!b.success) return NextResponse.json({ error: "Message text is required (max 1000 characters)." }, { status: 400 });
  const p = getPool();
  const t = (await p.query(`SELECT t.id, t.workspace_id, t.ig_account_id, t.igsid, t.last_inbound_at FROM ig_threads t WHERE t.id = $1`, [id])).rows[0];
  if (!t) return NextResponse.json({ error: "not found" }, { status: 404 });
  const hours = t.last_inbound_at ? (Date.now() - new Date(t.last_inbound_at).getTime()) / 3600000 : Infinity;
  if (hours >= 24) return NextResponse.json({ error: "Instagram only allows replies within 24 hours of the customer's last message.", window: "closed" }, { status: 403 });
  const s = await igSendDm(t.ig_account_id, t.igsid, b.data.body);
  if (!s.ok) {
    await recordOutbound(t.workspace_id, t.ig_account_id, t.id, `failed-${Date.now()}`, b.data.body, "app", "failed", s.error);
    return NextResponse.json({ error: s.error }, { status: 502 });
  }
  await recordOutbound(t.workspace_id, t.ig_account_id, t.id, s.mid, b.data.body, "app", "sent");
  await p.query(`UPDATE ig_threads SET automation_paused = true, automation_paused_at = now(), last_read_at = now() WHERE id = $1`, [id]);
  return NextResponse.json({ ok: true, mid: s.mid });
}
