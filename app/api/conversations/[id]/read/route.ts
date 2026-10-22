
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { getPool } from "@/lib/db";

/** POST — mark the conversation read (advances the unread pointer). */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const token = (await cookies()).get("nbo_session")?.value;
  if (!(await getSessionUser(token))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const r = await getPool().query(
    `UPDATE conversations SET last_read_at = now() WHERE id = $1 RETURNING id`,
    [id],
  );
  if (r.rows.length === 0) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
