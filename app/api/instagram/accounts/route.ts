import { NextResponse } from "next/server";
import { getTenant, unauthorized } from "@/lib/tenant";
import { pastIgAccounts } from "@/lib/instagram";

/** GET — Instagram accounts this workspace disconnected but still holds history for. */
export async function GET() {
  const t = await getTenant();
  if (!t) return unauthorized();
  return NextResponse.json({ ok: true, accounts: await pastIgAccounts(t.wsId) }, { headers: { "Cache-Control": "no-store" } });
}
