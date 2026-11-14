import { NextResponse } from "next/server";
import { z } from "zod";
import { getTenant, unauthorized } from "@/lib/tenant";
import { accountInfo, adsConnection, listAdAccounts, longLivedUserToken, removeConnection, saveConnection, systemAdAccounts } from "@/lib/meta-ads";

/**
 * Ad account connection for this workspace.
 * GET    → { connected, account?, canUseSystem, systemAccounts? }
 * POST   { mode: "system", adAccountId }                     — platform owner's workspace only
 *        { mode: "user", accessToken, adAccountId? }         — Facebook login token; without adAccountId returns the list to pick from
 * DELETE → disconnect (nothing changes on Meta)
 */
export async function GET() {
  const t = await getTenant();
  if (!t) return unauthorized();
  const c = await adsConnection(t.wsId);
  const canUseSystem = t.user.isOperator && !!process.env.META_ACCESS_TOKEN;
  const sys = canUseSystem && !c ? await systemAdAccounts() : null;
  const info = c ? await accountInfo(c) : null;
  return NextResponse.json({
    ok: true, connected: !!c, canUseSystem, appId: process.env.META_APP_ID ?? null,
    account: c ? { id: c.ad_account_id, name: c.name, currency: c.currency, timezone: c.timezone, system: c.uses_system_token, lastError: c.last_error,
      live: info ? { status: info.status, spent: info.spent, balanceLabel: info.balanceLabel, business: info.business } : null } : null,
    systemAccounts: sys?.ok ? sys.accounts : [],
  }, { headers: { "Cache-Control": "no-store" } });
}

const Body = z.union([
  z.object({ mode: z.literal("system"), adAccountId: z.string().regex(/^act_\d{5,}$/) }),
  z.object({ mode: z.literal("user"), accessToken: z.string().min(20).max(1000), adAccountId: z.string().regex(/^act_\d{5,}$/).optional() }),
]);

export async function POST(req: Request) {
  const t = await getTenant();
  if (!t) return unauthorized();
  const b = Body.safeParse(await req.json().catch(() => null));
  if (!b.success) return NextResponse.json({ error: "Pick an ad account to connect." }, { status: 400 });
  if (b.data.mode === "system") {
    if (!t.user.isOperator) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
    const list = await systemAdAccounts();
    const a = list.ok ? list.accounts.find((x) => x.id === b.data.adAccountId) : null;
    if (!a) return NextResponse.json({ error: list.ok ? "That ad account isn't available." : list.error }, { status: 400 });
    await saveConnection(t.wsId, a, { system: true }, t.user.email);
    return NextResponse.json({ ok: true, account: a });
  }
  const ll = await longLivedUserToken(b.data.accessToken);
  if (!ll.ok) return NextResponse.json({ error: ll.error }, { status: 502 });
  const list = await listAdAccounts(ll.token);
  if (!list.ok) return NextResponse.json({ error: list.error }, { status: 502 });
  if (!b.data.adAccountId) return NextResponse.json({ ok: true, pick: list.accounts });
  const a = list.accounts.find((x) => x.id === b.data.adAccountId);
  if (!a) return NextResponse.json({ error: "That ad account isn't available to this Facebook login." }, { status: 400 });
  await saveConnection(t.wsId, a, { token: ll.token, expiresAt: ll.expiresAt }, t.user.email);
  return NextResponse.json({ ok: true, account: a });
}

export async function DELETE() {
  const t = await getTenant();
  if (!t) return unauthorized();
  await removeConnection(t.wsId);
  return NextResponse.json({ ok: true });
}
