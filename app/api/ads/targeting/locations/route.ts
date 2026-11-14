import { NextResponse } from "next/server";
import { getTenant, unauthorized } from "@/lib/tenant";
import { adsConnection } from "@/lib/meta-ads";
import { searchLocations } from "@/lib/meta-ads-create";

/** Demo list (no ad account yet): enough to try the builder; real search comes from Meta once connected. */
const DEMO: { key: string; name: string; type: string; region?: string; country_code: string }[] = [
  { key: "IN", name: "India", type: "country", country_code: "IN" },
  ...["Kolkata:West Bengal", "Mumbai:Maharashtra", "Pune:Maharashtra", "Delhi:Delhi", "Bengaluru:Karnataka", "Chennai:Tamil Nadu", "Hyderabad:Telangana",
    "Ahmedabad:Gujarat", "Jaipur:Rajasthan", "Lucknow:Uttar Pradesh", "Siliguri:West Bengal", "Durgapur:West Bengal", "Howrah:West Bengal", "Guwahati:Assam", "Bhubaneswar:Odisha", "Patna:Bihar"]
    .map((x, i) => { const [name, region] = x.split(":"); return { key: `demo-city-${i}`, name, type: "city", region, country_code: "IN" }; }),
  ...["West Bengal", "Maharashtra", "Karnataka", "Tamil Nadu", "Delhi", "Gujarat", "Assam", "Odisha"].map((name, i) => ({ key: `demo-region-${i}`, name, type: "region", country_code: "IN" })),
];

export async function GET(req: Request) {
  const t = await getTenant();
  if (!t) return unauthorized();
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ ok: true, locations: [] });
  const c = await adsConnection(t.wsId);
  if (!c) return NextResponse.json({ ok: true, demo: true, locations: DEMO.filter((l) => l.name.toLowerCase().includes(q.toLowerCase())).slice(0, 10) });
  try { return NextResponse.json({ ok: true, locations: await searchLocations(c, q) }); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 422 }); }
}
