import { getTenant, isUuid } from "@/lib/tenant";
import { igThreadAvatar } from "@/lib/instagram";

/** GET — an Instagram DM contact's profile picture (404 → the app shows initials). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const t = await getTenant();
  if (!t) return new Response(null, { status: 401 });
  const { id } = await ctx.params;
  if (!isUuid(id)) return new Response(null, { status: 404 });
  const a = await igThreadAvatar(t.wsId, id).catch(() => null);
  // 204 (not 404): "no picture" is normal — the initials stay, and the browser console stays clean
  if (!a) return new Response(null, { status: 204, headers: { "Cache-Control": "private, max-age=3600" } });
  return new Response(a.bytes, { headers: { "Content-Type": a.type, "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" } });
}
