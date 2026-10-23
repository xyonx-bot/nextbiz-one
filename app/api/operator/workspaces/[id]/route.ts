import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { requireOperator } from "../../requests/route";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH { action: "revoke" | "restore", reason? } — revoke blocks login +
 *  messaging instantly (sessions die now); restore re-enables. Every action
 *  lands in the append-only ledger with the operator's identity. */
export async function PATCH(req: Request, ctx: Ctx) {
  const op = await requireOperator();
  if (!op) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { action?: string; reason?: string };
  const p = getPool();

  const ws = await p.query(`SELECT id, name FROM workspaces WHERE id = $1`, [id]);
  if (ws.rows.length === 0) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (body.action === "revoke") {
    const reason = (body.reason ?? "").trim();
    if (reason.length < 4) return NextResponse.json({ error: "A reason is required to revoke." }, { status: 400 });
    await p.query(`UPDATE workspaces SET revoked = true WHERE id = $1`, [id]);
    // kill every live session for users of this workspace — instant lockout
    await p.query(
      `DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE workspace_id = $1)`,
      [id],
    );
    await p.query(
      `INSERT INTO audit_log (actor_email, action, target, reason) VALUES ($1, 'revoked', $2, $3)`,
      [op.email, ws.rows[0].name, reason],
    );
    return NextResponse.json({ ok: true, revoked: true });
  }

  if (body.action === "restore") {
    await p.query(`UPDATE workspaces SET revoked = false WHERE id = $1`, [id]);
    await p.query(
      `INSERT INTO audit_log (actor_email, action, target) VALUES ($1, 'restored', $2)`,
      [op.email, ws.rows[0].name],
    );
    return NextResponse.json({ ok: true, revoked: false });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
