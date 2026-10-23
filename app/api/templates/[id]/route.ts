import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { submitTemplate } from "@/lib/wa-client";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH — edit body/name (draft state) or { action: "submit" | "refresh-status" | "duplicate" }. */
export async function PATCH(req: Request, ctx: Ctx) {
  const token = (await cookies()).get("nbo_session")?.value;
  if (!(await getSessionUser(token))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const p = getPool();
  const cur = await p.query(`SELECT * FROM templates WHERE id = $1`, [id]);
  if (cur.rows.length === 0) return NextResponse.json({ error: "not found" }, { status: 404 });
  const t = cur.rows[0];

  if (body.action === "submit") {
    const sub = await submitTemplate({
      name: t.meta_name ?? t.name, language: t.language, category: t.category, bodyText: t.body,
    });
    if (!sub.ok) return NextResponse.json({ error: sub.error }, { status: 502 });
    const r = await p.query(
      `UPDATE templates SET status='pending', meta_template_id=$2, rejection_reason=NULL, updated_at=now() WHERE id=$1 RETURNING *`,
      [id, sub.id],
    );
    return NextResponse.json({ ok: true, template: r.rows[0] });
  }

  if (body.action === "duplicate") {
    const ws = t.workspace_id;
    let n = `${t.name}_copy`, i = 1;
    while ((await p.query(`SELECT 1 FROM templates WHERE workspace_id=$1 AND name=$2`, [ws, n])).rows.length) {
      n = `${t.name}_copy${++i}`;
    }
    const r = await p.query(
      `INSERT INTO templates (workspace_id, name, meta_name, category, language, body, variables, status)
       VALUES ($1,$2,$2,$3,$4,$5,$6,'draft') RETURNING *`,
      [ws, n, t.category, t.language, t.body, t.variables],
    );
    return NextResponse.json({ ok: true, template: r.rows[0] }, { status: 201 });
  }

  // plain edit (draft or rejected resubmission prep)
  const name = typeof body.name === "string" ? body.name : t.name;
  const text = typeof body.body === "string" ? body.body : t.body;
  const r = await p.query(
    `UPDATE templates SET name=$2, meta_name=$2, body=$3, updated_at=now() WHERE id=$1 RETURNING *`,
    [id, name, text],
  );
  return NextResponse.json({ ok: true, template: r.rows[0] });
}
