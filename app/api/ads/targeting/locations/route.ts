import { NextResponse } from "next/server";
import { getTenant, unauthorized } from "@/lib/tenant";
import { findLocations } from "@/lib/ads-locations";

export async function GET(req: Request) {
  const t = await getTenant();
  if (!t) return unauthorized();
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ ok: true, locations: [] });
  try { const r = await findLocations(t.wsId, q); return NextResponse.json({ ok: true, demo: r.demo, locations: r.locations }); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 422 }); }
}
