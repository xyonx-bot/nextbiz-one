import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { getTenant, unauthorized, notFound, isUuid } from "@/lib/tenant";
import { getWaCreds, deleteTemplateOnMeta } from "@/lib/wa-client";
import { submitRow, varsOf, type TplRow } from "@/lib/templates";
import { PartsBase } from "@/lib/template-schema";

type Ctx = { params: Promise<{ id: string }> };
const Edit = z.object({
  name: z.string().trim().regex(/^[a-z0-9_]{3,64}$/, "Name: lowercase_with_underscores, 3–64 characters").optional(),
  body: z.string().trim().min(5).max(1024).optional(),
  variables: z.array(z.string().max(200)).max(20).optional(),
}).and(PartsBase.partial());

/** PATCH — edit (draft/rejected) or { action: "submit" | "duplicate" }. */
export async function PATCH(req: Request, ctx: Ctx) {
  const tn = await getTenant();
  if (!tn) return unauthorized();
  const { id } = await ctx.params;
  if (!isUuid(id)) return notFound();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const p = getPool();
  const cur = await p.query(`SELECT * FROM templates WHERE id = $1 AND workspace_id = $2`, [id, tn.wsId]);
  if (cur.rows.length === 0) return NextResponse.json({ error: "not found" }, { status: 404 });
  const t = cur.rows[0] as TplRow & { workspace_id: string };

  if (body.action === "submit") {
    if (!["draft", "rejected"].includes(t.status)) return NextResponse.json({ error: "Only drafts and rejected templates can be submitted." }, { status: 409 });
    const sub = await submitRow(tn.wsId, t);
    if (!sub.ok) return NextResponse.json({ error: sub.error }, { status: 422 });
    const r = await p.query(`UPDATE templates SET status='pending', meta_template_id=$2, rejection_reason=NULL, updated_at=now() WHERE id=$1 RETURNING *`, [id, sub.id]);
    return NextResponse.json({ ok: true, template: r.rows[0] });
  }

  if (body.action === "duplicate") {
    let n = `${t.name}_copy`, i = 1;
    while ((await p.query(`SELECT 1 FROM templates WHERE workspace_id=$1 AND name=$2`, [tn.wsId, n])).rows.length) n = `${t.name}_copy${++i}`;
    const r = await p.query(
      `INSERT INTO templates (workspace_id, name, meta_name, category, language, body, variables, status, header_format, header, header_media_id, footer, buttons_json)
       SELECT workspace_id, $2, $2, category, language, body, variables, 'draft', header_format, header, header_media_id, footer, buttons_json FROM templates WHERE id = $1 RETURNING *`,
      [id, n]);
    return NextResponse.json({ ok: true, template: r.rows[0] }, { status: 201 });
  }

  if (!["draft", "rejected"].includes(t.status)) return NextResponse.json({ error: "Approved and in-review templates can't be edited — duplicate it instead." }, { status: 409 });
  const e = Edit.safeParse(body);
  if (!e.success) return NextResponse.json({ error: e.error.issues[0]?.message ?? "Invalid change" }, { status: 400 });
  const d = e.data;
  const text = d.body ?? t.body;
  const fmt = body.headerFormat === undefined ? t.header_format : d.headerFormat ?? t.header_format;
  const r = await p.query(
    `UPDATE templates SET name=$2, meta_name=$2, body=$3, variables=$4, header_format=$5, header=$6, header_media_id=$7, footer=$8, buttons_json=$9::jsonb, updated_at=now()
      WHERE id=$1 RETURNING *`,
    [id, d.name ?? t.name, text, (d.variables ?? t.variables ?? []).slice(0, varsOf(text).length), fmt,
      fmt === "TEXT" ? (d.headerText !== undefined ? d.headerText : t.header) : null,
      ["IMAGE", "VIDEO", "DOCUMENT"].includes(fmt) ? (d.headerMediaId !== undefined ? d.headerMediaId : t.header_media_id) : null,
      d.footer !== undefined ? d.footer || null : t.footer, JSON.stringify(body.buttons === undefined ? t.buttons_json ?? [] : d.buttons ?? [])]);
  return NextResponse.json({ ok: true, template: r.rows[0] });
}

/** DELETE — removes it here and on Meta (when it was submitted). Broadcasts that used it keep it. */
export async function DELETE(_req: Request, ctx: Ctx) {
  const tn = await getTenant();
  if (!tn) return unauthorized();
  const { id } = await ctx.params;
  if (!isUuid(id)) return notFound();
  const p = getPool();
  const t = (await p.query(`SELECT * FROM templates WHERE id = $1 AND workspace_id = $2`, [id, tn.wsId])).rows[0];
  if (!t) return notFound();
  if ((await p.query(`SELECT 1 FROM broadcasts WHERE template_id = $1 LIMIT 1`, [id])).rows.length) {
    return NextResponse.json({ error: "A broadcast used this template, so it's kept for its report. Duplicate it to make changes instead." }, { status: 409 });
  }
  if (t.status !== "draft") {
    const d = await deleteTemplateOnMeta(await getWaCreds(tn.wsId), t.meta_name ?? t.name);
    if (!d.ok) return NextResponse.json({ error: `Meta didn't delete it: ${d.error}` }, { status: 422 });
  }
  await p.query(`DELETE FROM templates WHERE id = $1`, [id]);
  return NextResponse.json({ ok: true });
}
