import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { getPool } from "@/lib/db";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await getSessionUser((await cookies()).get("nbo_session")?.value))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  await getPool().query(`UPDATE ig_threads SET last_read_at = now() WHERE id = $1`, [id]);
  return NextResponse.json({ ok: true });
}
