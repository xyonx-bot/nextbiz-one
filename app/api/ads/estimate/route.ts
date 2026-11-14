import { NextResponse } from "next/server";
import { getTenant, unauthorized } from "@/lib/tenant";
import { adsConnection } from "@/lib/meta-ads";
import { estimateAudience } from "@/lib/meta-ads-create";
import { Targeting } from "@/lib/ads-spec";

/** POST targeting → Meta's estimated audience size (monthly active people). */
export async function POST(req: Request) {
  const t = await getTenant();
  if (!t) return unauthorized();
  const b = Targeting.safeParse(await req.json().catch(() => null));
  if (!b.success) return NextResponse.json({ ok: true, estimate: null });
  const c = await adsConnection(t.wsId);
  if (!c) return NextResponse.json({ ok: true, estimate: null, demo: true });
  try { return NextResponse.json({ ok: true, estimate: await estimateAudience(c, b.data) }); }
  catch { return NextResponse.json({ ok: true, estimate: null }); }
}
