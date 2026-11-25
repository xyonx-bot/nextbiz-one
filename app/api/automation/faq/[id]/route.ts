import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { getTenant, unauthorized, isUuid } from "@/lib/tenant";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const tn = await getTenant();
  if (!tn) return unauthorized();
  const { id } = await ctx.params;
  await getPool().query(`DELETE FROM faq_pairs WHERE id=$1 AND workspace_id=$2`, [isUuid(id) ? id : null, tn.wsId]);
  return NextResponse.json({ ok: true });
}
