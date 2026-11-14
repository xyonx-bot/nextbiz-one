import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { getTenant, unauthorized } from "@/lib/tenant";
import { adsConnection } from "@/lib/meta-ads";
import { publishCampaign, type AdSpec } from "@/lib/meta-ads-create";
import { Draft, Spec } from "@/lib/ads-spec";

/**
 * POST { spec, publish: boolean } — save the ad as a draft, or publish it to Meta (created PAUSED: nothing
 * spends until it's resumed in Campaigns, which asks for confirmation).
 */
export async function POST(req: Request) {
  const t = await getTenant();
  if (!t) return unauthorized();
  const body = (await req.json().catch(() => null)) as { spec?: unknown; publish?: boolean } | null;
  if (!body?.publish) {
    // drafts only need a name and a sane budget — the rest can be finished later
    const d = Draft.safeParse(body?.spec);
    if (!d.success) return NextResponse.json({ error: d.error.issues[0]?.message ?? "Give your campaign a name." }, { status: 400 });
    const s = d.data;
    const id = (await getPool().query(
      `INSERT INTO ads_mock_campaigns (workspace_id, name, objective, status, daily_budget, destination, start_time, stop_time, creative_headline, creative_body, audience, spec)
       VALUES ($1,$2,$3,'draft',$4,$5,$6,$7,$8,$9,$10,$11::jsonb) RETURNING id`,
      [t.wsId, s.name, s.goal === "website" ? "OUTCOME_TRAFFIC" : "OUTCOME_ENGAGEMENT", s.dailyBudget, s.goal === "website" ? "website" : "whatsapp",
       s.startTime ?? null, s.endTime ?? null, s.headline || null, s.primaryText || null, (s.locations ?? []).map((l) => l.name).join(", ").slice(0, 200) || null, JSON.stringify(body?.spec ?? {})])).rows[0].id;
    return NextResponse.json({ ok: true, draftId: id });
  }
  const p = Spec.safeParse(body?.spec);
  if (!p.success) return NextResponse.json({ error: p.error.issues[0]?.message ?? "Check the campaign details." }, { status: 400 });
  const s = p.data as AdSpec;
  const igPlacement = s.placements === "auto" || s.placements.some((x) => x.startsWith("instagram:"));
  if (s.format === "image" && !s.imageHash && body?.publish) return NextResponse.json({ error: "Upload an image for the ad." }, { status: 400 });
  if (s.format === "video" && !s.videoId && body?.publish) return NextResponse.json({ error: "Upload a video for the ad." }, { status: 400 });
  if (s.goal === "website" && !s.websiteUrl) return NextResponse.json({ error: "Add the website address people should visit." }, { status: 400 });
  if ((s.goal === "instagram_dm" || (igPlacement && body?.publish)) && !s.instagramId) return NextResponse.json({ error: "Choose the Instagram account the ad runs from." }, { status: 400 });

  const db = getPool();
  const objective = s.goal === "website" ? "OUTCOME_TRAFFIC" : "OUTCOME_ENGAGEMENT";
  const save = async (status: string, metaId: string | null) => (await db.query(
    `INSERT INTO ads_mock_campaigns (workspace_id, name, objective, status, daily_budget, destination, start_time, stop_time, creative_headline, creative_body, audience, spec, meta_campaign_id, published_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13, CASE WHEN $13::text IS NULL THEN NULL ELSE now() END) RETURNING id`,
    [t.wsId, s.name, objective, status, s.dailyBudget, s.goal === "website" ? "website" : "whatsapp", s.startTime ?? null, s.endTime ?? null,
     s.headline, s.primaryText, s.locations.map((l) => l.name).join(", ").slice(0, 200), JSON.stringify(s), metaId])).rows[0].id as string;

  const c = await adsConnection(t.wsId);
  if (!c) return NextResponse.json({ error: "Connect an ad account to publish." }, { status: 409 });
  if (s.locations.some((l) => l.key.startsWith("demo-"))) return NextResponse.json({ error: "Pick locations again — the demo list can't be published." }, { status: 400 });
  const r = await publishCampaign(c, s);
  if (!r.ok) return NextResponse.json({ error: `Meta didn't accept the ${r.step}: ${r.error}`, step: r.step }, { status: 422 });
  await save("paused", r.campaignId);
  console.log(`[ads] ${t.user.email} published campaign ${r.campaignId} (PAUSED) on ${c.ad_account_id}`);
  return NextResponse.json({ ok: true, campaignId: r.campaignId });
}
