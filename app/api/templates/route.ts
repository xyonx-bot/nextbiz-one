import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { getTenant, unauthorized } from "@/lib/tenant";
import { submitRow, TPL_COLS, TPL_FROM, varsOf, type TplRow } from "@/lib/templates";
import { Parts } from "@/lib/template-schema";

/** GET — list templates with header / footer / buttons. */
export async function GET() {
  const t = await getTenant();
  if (!t) return unauthorized();
  const { rows } = await getPool().query(`SELECT ${TPL_COLS} ${TPL_FROM} WHERE t.workspace_id = $1 ORDER BY t.updated_at DESC LIMIT 500`, [t.wsId]);
  return NextResponse.json({ ok: true, templates: rows });
}

const Create = z.object({
  name: z.string().trim().regex(/^[a-z0-9_]{3,64}$/, "Name: lowercase_with_underscores, 3–64 characters"),
  category: z.enum(["MARKETING", "UTILITY"]),
  language: z.string().trim().min(2).max(10),
  body: z.string().trim().min(5).max(1024),
  variables: z.array(z.string().max(200)).max(20).optional(),
  submit: z.boolean().optional(),
}).and(Parts);

/** POST — create (draft) and optionally submit straight to Meta. */
export async function POST(req: Request) {
  const t = await getTenant();
  if (!t) return unauthorized();
  const b = Create.safeParse(await req.json().catch(() => null));
  if (!b.success) return NextResponse.json({ error: b.error.issues[0]?.message ?? "Invalid template" }, { status: 400 });
  const d = b.data, p = getPool();
  if (/^\s*\{\{\d+\}\}|\{\{\d+\}\}[.!?\s]*$/.test(d.body)) return NextResponse.json({ error: "Meta rejects messages that start or end with a variable — add some words around it." }, { status: 400 });
  if (d.headerMediaId && !(await p.query(`SELECT 1 FROM media_files WHERE id = $1 AND workspace_id = $2`, [d.headerMediaId, t.wsId])).rows.length) return NextResponse.json({ error: "Upload the header file again." }, { status: 400 });
  try {
    const r = await p.query(
      `INSERT INTO templates (workspace_id, name, meta_name, category, language, body, variables, status, header_format, header, header_media_id, footer, buttons_json)
       VALUES ($1, $2, $2, $3, $4, $5, $6, 'draft', $7, $8, $9, $10, $11::jsonb) RETURNING *`,
      [t.wsId, d.name, d.category, d.language, d.body, (d.variables ?? []).slice(0, varsOf(d.body).length), d.headerFormat,
        d.headerFormat === "TEXT" ? d.headerText : null, ["IMAGE", "VIDEO", "DOCUMENT"].includes(d.headerFormat) ? d.headerMediaId ?? null : null, d.footer || null, JSON.stringify(d.buttons)]);
    const row = r.rows[0] as TplRow;
    if (!d.submit) return NextResponse.json({ ok: true, template: row }, { status: 201 });
    const sub = await submitRow(t.wsId, row);
    if (!sub.ok) return NextResponse.json({ ok: false, error: `Saved as a draft, but Meta said: ${sub.error}`, template: row }, { status: 422 });
    const upd = await p.query(`UPDATE templates SET status='pending', meta_template_id=$2, updated_at=now() WHERE id=$1 RETURNING *`, [row.id, sub.id]);
    return NextResponse.json({ ok: true, template: upd.rows[0] }, { status: 201 });
  } catch (e) {
    if (String(e).includes("duplicate key")) return NextResponse.json({ error: "A template with that name exists." }, { status: 409 });
    return NextResponse.json({ error: "Couldn't save the template." }, { status: 500 });
  }
}
