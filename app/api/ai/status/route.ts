import { NextResponse } from "next/server";
import { getTenant, unauthorized } from "@/lib/tenant";
import { aiConfig, aiKeyPresent, usedToday } from "@/lib/ai";

/** GET — is AI available for this workspace, and how much of today's limit is used. */
export async function GET() {
  const t = await getTenant();
  if (!t) return unauthorized();
  const cfg = await aiConfig();
  return NextResponse.json({ ok: true, available: aiKeyPresent() && cfg.enabled, usedToday: await usedToday(t.wsId), limit: cfg.dailyLimit }, { headers: { "Cache-Control": "no-store" } });
}
