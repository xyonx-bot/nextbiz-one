import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { connectIgAccount, getIgAccount, ensureWorkspace, igLive } from "@/lib/instagram";

/** IG connection status for the Settings > Connections surface. */
export async function GET() {
  const token = (await cookies()).get("nbo_session")?.value;
  const u = await getSessionUser(token);
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const wsId = await ensureWorkspace();
  const account = await getIgAccount(wsId);
  return NextResponse.json({ ok: true, live: igLive(), account });
}

/**
 * Connect Instagram account. Mock mode (IG_LIVE != "true"): stores a mock
 * account, no Graph call. Live mode: exchanges the IG user access token for
 * a long-lived one. Never returns the stored token.
 */
export async function POST(req: Request) {
  const token = (await cookies()).get("nbo_session")?.value;
  const u = await getSessionUser(token);
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { access_token?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  if (!body.access_token || typeof body.access_token !== "string") {
    return NextResponse.json({ error: "access_token required" }, { status: 400 });
  }
  const wsId = await ensureWorkspace();
  try {
    const { account, mock } = await connectIgAccount(wsId, body.access_token);
    return NextResponse.json({ ok: true, mock, live: igLive(), account });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

/** Disconnect: keep audit trail, drop the token, mark mock. */
export async function DELETE() {
  const token = (await cookies()).get("nbo_session")?.value;
  const u = await getSessionUser(token);
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const wsId = await ensureWorkspace();
  await getPool().query(
    `UPDATE ig_accounts SET access_token = NULL, live = false, updated_at = now() WHERE workspace_id = $1`,
    [wsId],
  );
  await getPool().query(
    `INSERT INTO ig_audit (workspace_id, action, detail) VALUES ($1, 'disconnect', '{}'::jsonb)`,
    [wsId],
  );
  return NextResponse.json({ ok: true });
}
