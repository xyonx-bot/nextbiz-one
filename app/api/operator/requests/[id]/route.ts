import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { requireOperator } from "@/lib/operator";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH { action: "approve" | "reject", reason? } — one decision at a time,
 *  each logged in the append-only ledger. Approve creates the workspace +
 *  flips the user account approved. */
export async function PATCH(req: Request, ctx: Ctx) {
  const op = await requireOperator();
  if (!op) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { action?: string; reason?: string };
  const p = getPool();

  const reqRow = await p.query(`SELECT * FROM access_requests WHERE id = $1 AND status = 'pending'`, [id]);
  if (reqRow.rows.length === 0) return NextResponse.json({ error: "Request not found or already judged." }, { status: 404 });
  const r = reqRow.rows[0];

  if (body.action === "approve") {
    // workspace name: requested business name, deduped
    let name = r.business_name, i = 1;
    while ((await p.query(`SELECT 1 FROM workspaces WHERE name = $1`, [name])).rows.length > 0) {
      name = `${r.business_name} (${++i})`;
    }
    const ws = await p.query(`INSERT INTO workspaces (name) VALUES ($1) RETURNING id`, [name]);
    const wsId = ws.rows[0].id;
    if (r.user_id) {
      await p.query(`UPDATE users SET is_approved = true, workspace_id = $2 WHERE id = $1`, [r.user_id, wsId]);
    }
    await p.query(`UPDATE access_requests SET status='approved', reviewed_at=now() WHERE id = $1`, [id]);
    await p.query(
      `INSERT INTO audit_log (actor_email, action, target) VALUES ($1, 'approved', $2)`,
      [op.email, r.business_name],
    );
    return NextResponse.json({ ok: true, workspace: name });
  }

  if (body.action === "reject") {
    const reason = (body.reason ?? "").trim();
    if (reason.length < 4) return NextResponse.json({ error: "A reason is required for rejections." }, { status: 400 });
    await p.query(`UPDATE access_requests SET status='rejected', reject_reason=$2, reviewed_at=now() WHERE id=$1`, [id, reason]);
    await p.query(
      `INSERT INTO audit_log (actor_email, action, target, reason) VALUES ($1, 'rejected', $2, $3)`,
      [op.email, r.business_name, reason],
    );
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
