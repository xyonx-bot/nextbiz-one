/**
 * Ad locations — one source for the builder's location search, the AI's search tool and the server-side
 * check of AI-proposed locations. Real Meta targeting search when an ad account is connected; otherwise a
 * small demo list (planner mode, can't be published).
 */
import { adsConnection } from "./meta-ads";
import { searchLocations, type GeoHit } from "./meta-ads-create";

export const DEMO_LOCATIONS: GeoHit[] = [
  { key: "IN", name: "India", type: "country", country_code: "IN" },
  ...["Kolkata:West Bengal", "Mumbai:Maharashtra", "Pune:Maharashtra", "Delhi:Delhi", "Bengaluru:Karnataka", "Chennai:Tamil Nadu", "Hyderabad:Telangana",
    "Ahmedabad:Gujarat", "Jaipur:Rajasthan", "Lucknow:Uttar Pradesh", "Siliguri:West Bengal", "Durgapur:West Bengal", "Howrah:West Bengal", "Guwahati:Assam", "Bhubaneswar:Odisha", "Patna:Bihar"]
    .map((x, i) => { const [name, region] = x.split(":"); return { key: `demo-city-${i}`, name, type: "city", region, country_code: "IN" }; }),
  ...["West Bengal", "Maharashtra", "Karnataka", "Tamil Nadu", "Delhi", "Gujarat", "Assam", "Odisha"].map((name, i) => ({ key: `demo-region-${i}`, name, type: "region", country_code: "IN" })),
];

export async function findLocations(wsId: string, q: string): Promise<{ demo: boolean; locations: GeoHit[] }> {
  const c = await adsConnection(wsId);
  if (!c) return { demo: true, locations: DEMO_LOCATIONS.filter((l) => l.name.toLowerCase().includes(q.toLowerCase())).slice(0, 10) };
  return { demo: false, locations: await searchLocations(c, q) };
}

type L = { key?: string; type?: string; name?: string; radiusKm?: number };
/** Keep only locations that really exist (re-searched by name); drop anything the AI made up. */
export async function verifyLocations(wsId: string, locs: L[]): Promise<{ ok: (Required<Pick<L, "key" | "type" | "name">> & { radiusKm?: number })[]; dropped: string[] }> {
  const ok: (Required<Pick<L, "key" | "type" | "name">> & { radiusKm?: number })[] = [], dropped: string[] = [];
  for (const l of locs.slice(0, 25)) {
    const name = String(l.name ?? "").trim();
    if (!name) continue;
    const { locations } = await findLocations(wsId, name.split(",")[0]).catch(() => ({ locations: [] as GeoHit[] }));
    const hit = locations.find((h) => h.key === l.key) ?? locations.find((h) => h.name.toLowerCase() === name.split(",")[0].toLowerCase() && (!l.type || h.type === l.type)) ?? null;
    if (!hit) { dropped.push(name); continue; }
    ok.push({ key: String(hit.key), type: hit.type, name: hit.name, ...(hit.type === "city" ? { radiusKm: Math.min(80, Math.max(10, Number(l.radiusKm) || 25)) } : {}) });
  }
  return { ok, dropped };
}
