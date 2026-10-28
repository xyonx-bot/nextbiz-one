import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { draftToCampaign, filterCampaigns, seedCampaigns } from "@/lib/ads";

async function auth() {
  const token = (await cookies()).get("nbo_session")?.value;
  return getSessionUser(token);
}

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
  if (!(await auth())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const p = new URL(req.url).searchParams;
  const ws = (await getPool().query(`SELECT id FROM workspaces WHERE name='NextBiz One' LIMIT 1`)).rows[0].id;
  const drafts = (await getPool().query(
    `SELECT id, name, objective, status, daily_budget, start_time, stop_time, destination
       FROM ads_mock_campaigns WHERE workspace_id=$1 ORDER BY created_at DESC`, [ws],
  )).rows;
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
  if (!(await auth())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = Create.safeParse(await req.json().catch(() => null));
  if (!b.success) return NextResponse.json({ error: "Invalid campaign" }, { status: 400 });
  const ws = (await getPool().query(`SELECT id FROM workspaces WHERE name='NextBiz One' LIMIT 1`)).rows[0].id;
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
