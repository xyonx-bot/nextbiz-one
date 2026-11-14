import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { getTenant, unauthorized, notFound, isUuid } from "@/lib/tenant";
import { draftToCampaign, seedCampaigns } from "@/lib/ads";


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
  const { rows } = await getPool().query(
    `UPDATE ads_mock_campaigns SET status=$2 WHERE id=$1 AND workspace_id=$3
       RETURNING id, name, objective, status, daily_budget, start_time, stop_time, destination`,
    [isUuid(id) ? id : null, b.data.status, tn.wsId],
  );
  if (rows.length === 0) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  return NextResponse.json({ ok: true, demo: true, campaign: draftToCampaign(rows[0]) });
}
