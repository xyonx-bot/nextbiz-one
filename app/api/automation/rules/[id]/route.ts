import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { getPool } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH — edit rule / toggle; DELETE — remove. Off rules keep data (spec). */
export async function PATCH(req: Request, ctx: Ctx) {
  const token = (await cookies()).get("nbo_session")?.value;
  if (!(await getSessionUser(token))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const p = getPool();
  const cur = await p.query(`SELECT * FROM keyword_rules WHERE id=$1`, [id]);
  if (cur.rows.length === 0) return NextResponse.json({ error: "not found" }, { status: 404 });
  const r = cur.rows[0];
  await p.query(
    `UPDATE keyword_rules SET name=$2, keywords=$3, reply=$4, enabled=$5, send_once=$6, updated_at=now() WHERE id=$1`,
    [id,
     typeof body.name === "string" ? body.name : r.name,
     Array.isArray(body.keywords) ? body.keywords : r.keywords,
     typeof body.reply === "string" ? body.reply : r.reply,
     typeof body.enabled === "boolean" ? body.enabled : r.enabled,
     typeof body.sendOnce === "boolean" ? body.sendOnce : r.send_once],
  );
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const token = (await cookies()).get("nbo_session")?.value;
  if (!(await getSessionUser(token))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  await getPool().query(`DELETE FROM keyword_rules WHERE id=$1`, [id]);
  return NextResponse.json({ ok: true });
}
