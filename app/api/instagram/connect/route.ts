import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { getTenant, unauthorized } from "@/lib/tenant";
import { connectIgAccount, disconnectIg, getIgAccount, igLive } from "@/lib/instagram";

/** IG connection status for the Settings > Connections surface. */
export async function GET() {
  const tn = await getTenant();
  if (!tn) return unauthorized();
  const wsId = tn.wsId;
  const account = await getIgAccount(wsId);
  return NextResponse.json({ ok: true, live: igLive(), account });
}

/**
 * Connect Instagram account. Mock mode (IG_LIVE != "true"): stores a mock
 * account, no Graph call. Live mode: exchanges the IG user access token for
 * a long-lived one. Never returns the stored token.
 */
export async function POST(req: Request) {
  const tn = await getTenant();
  if (!tn) return unauthorized();
  let body: { access_token?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  if (!body.access_token || typeof body.access_token !== "string") {
    return NextResponse.json({ error: "access_token required" }, { status: 400 });
  }
  const wsId = tn.wsId;
  try {
    const { account, mock } = await connectIgAccount(wsId, body.access_token);
    return NextResponse.json({ ok: true, mock, live: igLive(), account });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 422 });
  }
}

/** Disconnect: stop Instagram's events, drop the token, keep the audit trail. History stays hidden until reconnected or deleted. */
export async function DELETE() {
  const tn = await getTenant();
  if (!tn) return unauthorized();
  await disconnectIg(tn.wsId);
  await getPool().query(`DELETE FROM ig_accounts WHERE workspace_id = $1 AND ig_user_id = 'mock-ig-user'`, [tn.wsId]);
  await getPool().query(`INSERT INTO ig_audit (workspace_id, action, detail) VALUES ($1, 'disconnect', '{}'::jsonb)`, [tn.wsId]);
  return NextResponse.json({ ok: true });
}
