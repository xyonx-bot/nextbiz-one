import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { getTenant, unauthorized, notFound, isUuid } from "@/lib/tenant";
import { draftToCampaign, performance, seedCampaigns } from "@/lib/ads";


/** GET — performance view (P2.3): totals + daily series over 7d|30d across
 *  demo fixtures + drafts. Mock-badged until real insights exist. */
export async function GET(req: Request) {
  const tn = await getTenant();
  if (!tn) return unauthorized();
  const range = new URL(req.url).searchParams.get("range") === "30d" ? 30 : 7;
  const ws = tn.wsId;
  const drafts = (await getPool().query(
    `SELECT id, name, objective, status, daily_budget, start_time, stop_time, destination
       FROM ads_mock_campaigns WHERE workspace_id=$1 ORDER BY created_at DESC`, [ws],
  )).rows;
  const report = performance(
    [...drafts.map(draftToCampaign), ...seedCampaigns(ws)],
    range as 7 | 30, ws,
  );
  return NextResponse.json({ ok: true, ...report },
    { headers: { "Cache-Control": "no-store" } });
}
