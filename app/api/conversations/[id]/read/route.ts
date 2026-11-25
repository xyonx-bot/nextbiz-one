
import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { getTenant, unauthorized, notFound, isUuid } from "@/lib/tenant";

/** POST — mark the conversation read (advances the unread pointer). */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const t = await getTenant();
  if (!t) return unauthorized();
  const { id } = await ctx.params;
  if (!isUuid(id)) return notFound();
  const r = await getPool().query(
    `UPDATE conversations SET last_read_at = now() WHERE id = $1 AND workspace_id = $2 RETURNING id`,
    [id, t.wsId],
  );
  if (r.rows.length === 0) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
