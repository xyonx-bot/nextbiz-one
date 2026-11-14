import { NextResponse } from "next/server";
import { getTenant, unauthorized, notFound, isUuid } from "@/lib/tenant";
import { commentDetail } from "@/lib/social";

/** GET — one comment with the other comments on the same post, the commenter, their DM thread and the post. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const t = await getTenant();
  if (!t) return unauthorized();
  const { id } = await ctx.params;
  if (!isUuid(id)) return notFound();
  const d = await commentDetail(t.wsId, id);
  if (!d) return notFound();
  return NextResponse.json({ ok: true, ...d }, { headers: { "Cache-Control": "no-store" } });
}
