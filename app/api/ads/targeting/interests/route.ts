import { NextResponse } from "next/server";
import { getTenant, unauthorized } from "@/lib/tenant";
import { adsConnection } from "@/lib/meta-ads";
import { searchInterests } from "@/lib/meta-ads-create";

/** GET ?q= — Meta's detailed-targeting interests (e.g. "bakery", "small business"). */
export async function GET(req: Request) {
  const t = await getTenant();
  if (!t) return unauthorized();
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  const c = await adsConnection(t.wsId);
  if (q.length < 2 || !c) return NextResponse.json({ ok: true, interests: [] });
  try { return NextResponse.json({ ok: true, interests: await searchInterests(c, q) }); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 502 }); }
}
