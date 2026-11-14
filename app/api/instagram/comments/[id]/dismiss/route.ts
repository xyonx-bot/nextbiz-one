import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { getTenant, unauthorized, notFound, isUuid } from "@/lib/tenant";

/** POST { undo?: boolean } — move a comment out of "Needs reply" (or back). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const t = await getTenant();
  if (!t) return unauthorized();
  const { id } = await ctx.params;
  if (!isUuid(id)) return notFound();
  const undo = ((await req.json().catch(() => ({}))) as { undo?: boolean }).undo === true;
  const r = await getPool().query(
    `UPDATE ig_comments c SET hidden_at = ${undo ? "NULL" : "now()"} FROM ig_accounts a
      WHERE c.id = $1 AND a.id = c.ig_account_id AND a.workspace_id = $2 RETURNING c.id`, [id, t.wsId]);
  if (!r.rowCount) return notFound();
  return NextResponse.json({ ok: true });
}
