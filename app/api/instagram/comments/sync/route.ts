import { NextResponse } from "next/server";
import { getTenant, unauthorized } from "@/lib/tenant";
import { syncIfStale } from "@/lib/ig-sync";

/** POST { force?: boolean } — pull this workspace's Instagram comments from the API (throttled unless forced). */
export async function POST(req: Request) {
  const t = await getTenant();
  if (!t) return unauthorized();
  const force = ((await req.json().catch(() => ({}))) as { force?: boolean }).force === true;
  const r = await syncIfStale(t.wsId, force ? 15_000 : 3 * 60_000);
  return NextResponse.json({ ok: true, synced: !!r, ...(r ?? {}) });
}
