import { NextResponse } from "next/server";
import { getTenant, unauthorized } from "@/lib/tenant";
import { commentCounts, listComments, mediaFor, type CommentFilter } from "@/lib/social";

/** GET ?filter=needs|auto|replied|all&media=<id> — Instagram comments for this workspace + counts + post info. */
export async function GET(req: Request) {
  const t = await getTenant();
  if (!t) return unauthorized();
  const u = new URL(req.url);
  const f = u.searchParams.get("filter");
  const filter: CommentFilter = f === "needs" || f === "auto" || f === "replied" ? f : "all";
  const media = u.searchParams.get("media");
  const [comments, counts] = await Promise.all([listComments(t.wsId, { filter, media: media && /^[\w-]{1,64}$/.test(media) ? media : null }), commentCounts(t.wsId)]);
  const mediaInfo = await mediaFor(t.wsId, comments);
  return NextResponse.json({ ok: true, comments, counts, media: mediaInfo }, { headers: { "Cache-Control": "no-store" } });
}
