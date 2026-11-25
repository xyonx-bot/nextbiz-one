import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { getTenant, unauthorized } from "@/lib/tenant";
import { draftToCampaign, filterCampaigns, seedCampaigns } from "@/lib/ads";
import { adsConnection, liveCampaigns } from "@/lib/meta-ads";


const Create = z.object({
  name: z.string().trim().min(1).max(80),
  objective: z.enum(["OUTCOME_ENGAGEMENT", "OUTCOME_TRAFFIC", "OUTCOME_LEADS", "OUTCOME_SALES", "OUTCOME_AWARENESS"]),
  daily_budget: z.number().int().min(0).max(100000), // INR rupees
  destination: z.enum(["whatsapp", "website"]),
  start_time: z.string().datetime().nullable().optional(),
  stop_time: z.string().datetime().nullable().optional(),
  creative_headline: z.string().trim().max(120).nullable().optional(),
  creative_body: z.string().trim().max(600).nullable().optional(),
  audience: z.string().trim().max(200).nullable().optional(),
  submit: z.boolean().optional(), // true => in_review, false/absent => draft
});

/** GET — campaign list (P2.1): deterministic demo fixtures + this workspace's
 *  drafts, searched/filtered. demo:true = mock-badged (Meta audit Oct 27). */
export async function GET(req: Request) {
  const tn = await getTenant();
  if (!tn) return unauthorized();
  const p = new URL(req.url).searchParams;
  const ws = tn.wsId;
  const drafts = (await getPool().query(
    `SELECT id, name, objective, status, daily_budget, start_time, stop_time, destination
       FROM ads_mock_campaigns WHERE workspace_id=$1 ORDER BY created_at DESC`, [ws],
  )).rows;
  const conn = await adsConnection(ws);
  if (conn) {
    // live: the connected Meta ad account (+ this workspace's unpublished drafts)
    const live = await liveCampaigns(conn, p.get("range") === "30d" ? 30 : 7);
    if (!live.ok) return NextResponse.json({ error: live.error, account: { id: conn.ad_account_id, name: conn.name } }, { status: 422 });
    // drafts that were published already show up as the live campaign — don't list them twice
    const published = new Set((await getPool().query(`SELECT id FROM ads_mock_campaigns WHERE workspace_id = $1 AND meta_campaign_id IS NOT NULL`, [ws])).rows.map((r) => r.id));
    const campaigns = filterCampaigns([...drafts.filter((d) => !published.has(d.id)).map(draftToCampaign), ...live.campaigns], p.get("q") ?? "", p.get("status"));
    return NextResponse.json({ ok: true, demo: false, account: { id: conn.ad_account_id, name: conn.name, currency: conn.currency }, campaigns },
      { headers: { "Cache-Control": "no-store" } });
  }
  const campaigns = filterCampaigns(
    [...drafts.map(draftToCampaign), ...seedCampaigns(ws)],
    p.get("q") ?? "", p.get("status"),
  );
  return NextResponse.json({ ok: true, demo: true, campaigns },
    { headers: { "Cache-Control": "no-store" } });
}

/** POST — guided-creation submit (P2.2): persists a draft (or submits for
 *  "review"). Mock-badged; the review status mirrors Meta's flow shape. */
export async function POST(req: Request) {
  const tn = await getTenant();
  if (!tn) return unauthorized();
  const b = Create.safeParse(await req.json().catch(() => null));
  if (!b.success) return NextResponse.json({ error: "Invalid campaign" }, { status: 400 });
  const ws = tn.wsId;
  const d = b.data;
  const { rows } = await getPool().query(
    `INSERT INTO ads_mock_campaigns
       (workspace_id, name, objective, status, daily_budget, destination,
        start_time, stop_time, creative_headline, creative_body, audience)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING id, name, objective, status, daily_budget, start_time, stop_time, destination`,
    [ws, d.name, d.objective, d.submit ? "in_review" : "draft", d.daily_budget, d.destination,
     d.start_time ?? null, d.stop_time ?? null, d.creative_headline ?? null, d.creative_body ?? null, d.audience ?? null],
  );
  return NextResponse.json({ ok: true, demo: true, campaign: draftToCampaign(rows[0]) },
    { status: 201 });
}
