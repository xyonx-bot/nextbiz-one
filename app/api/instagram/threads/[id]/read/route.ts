import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { getTenant, unauthorized, notFound, isUuid } from "@/lib/tenant";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const tn = await getTenant();
  if (!tn) return unauthorized();
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  await getPool().query(`UPDATE ig_threads SET last_read_at = now() WHERE id = $1 AND workspace_id = $2`, [id, tn.wsId]);
  return NextResponse.json({ ok: true });
}
