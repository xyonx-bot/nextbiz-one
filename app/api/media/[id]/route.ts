import { getPool } from "@/lib/db";
import { getTenant, isUuid } from "@/lib/tenant";

/** GET — the stored file (this workspace only), for previews in the app. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const t = await getTenant();
  if (!t) return new Response("unauthorized", { status: 401 });
  const { id } = await ctx.params;
  if (!isUuid(id)) return new Response("not found", { status: 404 });
  const f = (await getPool().query(`SELECT name, mime, bytes FROM media_files WHERE id = $1 AND workspace_id = $2`, [id, t.wsId])).rows[0];
  if (!f) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(f.bytes as Buffer), {
    headers: { "Content-Type": f.mime, "Cache-Control": "private, max-age=86400", "Content-Disposition": `inline; filename="${encodeURIComponent(f.name)}"`, "X-Content-Type-Options": "nosniff" },
  });
}
