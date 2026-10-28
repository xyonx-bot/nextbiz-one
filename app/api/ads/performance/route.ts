import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { draftToCampaign, performance, seedCampaigns } from "@/lib/ads";

async function auth() {
  const token = (await cookies()).get("nbo_session")?.value;
  return getSessionUser(token);
}

/** GET — performance view (P2.3): totals + daily series over 7d|30d across
 *  demo fixtures + drafts. Mock-badged until real insights exist. */
export async function GET(req: Request) {
  if (!(await auth())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const range = new URL(req.url).searchParams.get("range") === "30d" ? 30 : 7;
  const ws = (await getPool().query(`SELECT id FROM workspaces WHERE name='NextBiz One' LIMIT 1`)).rows[0].id;
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
