import { NextResponse } from "next/server";
import { getTenant, unauthorized } from "@/lib/tenant";
import { adsConnection } from "@/lib/meta-ads";
import { identities } from "@/lib/meta-ads-create";

/** GET — Facebook Pages and Instagram accounts this ad account can advertise as. */
export async function GET() {
  const t = await getTenant();
  if (!t) return unauthorized();
  const c = await adsConnection(t.wsId);
  if (!c) return NextResponse.json({ ok: true, connected: false, pages: [], instagram: [], pageError: null });
  try { return NextResponse.json({ ok: true, connected: true, account: { id: c.ad_account_id, name: c.name }, ...(await identities(c)) }, { headers: { "Cache-Control": "no-store" } }); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 502 }); }
}
