import { NextResponse } from "next/server";
import { getTenant, unauthorized } from "@/lib/tenant";
import { adsConnection } from "@/lib/meta-ads";
import { videoState } from "@/lib/meta-ads-create";

/** GET — has Meta finished processing the uploaded video? (+ its thumbnail) */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const t = await getTenant();
  if (!t) return unauthorized();
  const { id } = await ctx.params;
  if (!/^\d{5,}$/.test(id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const c = await adsConnection(t.wsId);
  if (!c) return NextResponse.json({ error: "No ad account connected." }, { status: 409 });
  return NextResponse.json({ ok: true, ...(await videoState(c, id)) }, { headers: { "Cache-Control": "no-store" } });
}
