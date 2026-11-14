import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { getTenant, unauthorized, notFound, isUuid } from "@/lib/tenant";
import { draftToCampaign, seedCampaigns } from "@/lib/ads";
import { adsConnection, liveCampaigns, setLiveStatus } from "@/lib/meta-ads";


/** GET — one campaign (demo fixture by `demo-…` id, or a workspace draft). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const tn = await getTenant();
  if (!tn) return unauthorized();
  const { id } = await ctx.params;
  if (id.startsWith("demo-")) {
    const ws = tn.wsId;
    const c = seedCampaigns(ws).find((x) => x.id === id);
    if (!c) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    return NextResponse.json({ ok: true, demo: true, campaign: c },
      { headers: { "Cache-Control": "no-store" } });
  }
  if (/^\d{6,}$/.test(id)) {
    const conn = await adsConnection(tn.wsId);
    const live = conn ? await liveCampaigns(conn) : null;
    const c = live?.ok ? live.campaigns.find((x) => x.id === id) : null;
    if (!c) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    return NextResponse.json({ ok: true, demo: false, campaign: c }, { headers: { "Cache-Control": "no-store" } });
  }
  const { rows } = await getPool().query(
    `SELECT id, name, objective, status, daily_budget, start_time, stop_time, destination
       FROM ads_mock_campaigns WHERE id=$1 AND workspace_id=$2 LIMIT 1`, [isUuid(id) ? id : null, tn.wsId],
  );
  if (rows.length === 0) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  return NextResponse.json({ ok: true, demo: true, campaign: draftToCampaign(rows[0]) },
    { headers: { "Cache-Control": "no-store" } });
}

const Patch = z.object({ status: z.enum(["active", "paused", "cancelled"]) });

/** PATCH — pause/resume/cancel (P2.1 mock actions). Demo fixtures are read-only. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const tn = await getTenant();
  if (!tn) return unauthorized();
  const { id } = await ctx.params;
  if (id.startsWith("demo-"))
    return NextResponse.json({ error: "Demo campaigns are read-only — connect a real ad account to manage live campaigns." }, { status: 409 });
  const b = Patch.safeParse(await req.json().catch(() => null));
  if (!b.success) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  if (/^\d{6,}$/.test(id)) {
    // live campaign on Meta: pause/resume only (resuming starts real spend — the UI confirms first)
    const conn = await adsConnection(tn.wsId);
    if (!conn) return NextResponse.json({ error: "No ad account connected." }, { status: 409 });
    if (b.data.status === "cancelled") return NextResponse.json({ error: "Delete or archive live campaigns in Meta Ads Manager." }, { status: 409 });
    const r = await setLiveStatus(conn, id, b.data.status === "active" ? "ACTIVE" : "PAUSED");
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 502 });
    console.log(`[ads] ${tn.user.email} set campaign ${id} → ${b.data.status} on ${conn.ad_account_id}`);
    return NextResponse.json({ ok: true, demo: false });
  }
  const { rows } = await getPool().query(
    `UPDATE ads_mock_campaigns SET status=$2 WHERE id=$1 AND workspace_id=$3
       RETURNING id, name, objective, status, daily_budget, start_time, stop_time, destination`,
    [isUuid(id) ? id : null, b.data.status, tn.wsId],
  );
  if (rows.length === 0) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  return NextResponse.json({ ok: true, demo: true, campaign: draftToCampaign(rows[0]) });
}
