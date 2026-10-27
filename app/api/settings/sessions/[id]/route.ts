import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { getPool } from "@/lib/db";

/** DELETE — revoke one session (logout everywhere except current, guarded). */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const token = (await cookies()).get("nbo_session")?.value;
  const u = await getSessionUser(token);
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  // id is md5(token) — the table's PK is token, there is no id column
  await getPool().query(`DELETE FROM sessions WHERE md5(token) = $1 AND user_id = $2 AND token <> $3`, [id, u.id, token]);
  return NextResponse.json({ ok: true });
}
