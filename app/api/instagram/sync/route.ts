import { NextResponse } from "next/server";
import { getTenant, unauthorized } from "@/lib/tenant";
import { syncIfStale } from "@/lib/ig-sync";

/** POST { what?: "comments"|"dms"|"both", force?: boolean } — pull this workspace's Instagram data from the API (throttled). */
export async function POST(req: Request) {
  const t = await getTenant();
  if (!t) return unauthorized();
  const b = (await req.json().catch(() => ({}))) as { what?: string; force?: boolean };
  const what = b.what === "dms" || b.what === "both" ? b.what : "comments";
  const r = await syncIfStale(t.wsId, b.force ? 15_000 : 45_000, what);
  return NextResponse.json({ ok: true, synced: !!r, ...(r ?? {}) });
}
