import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { getTenant, unauthorized, notFound, isUuid } from "@/lib/tenant";
import { igModerateComment } from "@/lib/instagram";

/** POST { action } — hide, unhide or delete a comment on Instagram itself (not only inside NextBiz One). */
const Body = z.object({ action: z.enum(["hide", "unhide", "delete"]) });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const t = await getTenant();
  if (!t) return unauthorized();
  const { id } = await ctx.params;
  if (!isUuid(id)) return notFound();
  const b = Body.safeParse(await req.json().catch(() => null));
  if (!b.success) return NextResponse.json({ error: "Choose hide, unhide or delete." }, { status: 400 });
  const p = getPool();
  const c = (await p.query(
    `SELECT c.comment_id, a.id AS account_id FROM ig_comments c JOIN ig_accounts a ON a.id = c.ig_account_id
      WHERE c.id = $1 AND a.workspace_id = $2 AND a.live`, [id, t.wsId])).rows[0];
  if (!c) return notFound();
  const r = await igModerateComment(c.account_id, c.comment_id, b.data.action);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 422 });
  if (b.data.action === "delete") await p.query(`DELETE FROM ig_comments WHERE id = $1`, [id]);
  else await p.query(`UPDATE ig_comments SET ig_hidden_at = ${b.data.action === "hide" ? "now()" : "NULL"} WHERE id = $1`, [id]);
  return NextResponse.json({ ok: true });
}
