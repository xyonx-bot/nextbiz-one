import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { submitTemplate } from "@/lib/wa-client";

/** GET — list templates (status counts derive client-side per wireframe pills). */
export async function GET() {
  const token = (await cookies()).get("nbo_session")?.value;
  if (!(await getSessionUser(token))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { rows } = await getPool().query(
    `SELECT t.id, t.name, t.meta_name, t.category, t.language, t.body, t.variables,
            t.status, t.rejection_reason, t.updated_at
       FROM templates t ORDER BY t.updated_at DESC LIMIT 500`,
  );
  return NextResponse.json({ ok: true, templates: rows });
}

const Create = z.object({
  name: z.string().trim().regex(/^[a-z0-9_]{3,64}$/, "lowercase_with_underscores"),
  category: z.enum(["MARKETING", "UTILITY"]),
  language: z.string().trim().min(2).max(10),
  body: z.string().trim().min(5).max(1024),
  variables: z.array(z.string()).max(10).optional(),
  submit: z.boolean().optional(),
});

/** POST — create (draft) and optionally submit straight to Meta. */
export async function POST(req: Request) {
  const token = (await cookies()).get("nbo_session")?.value;
  if (!(await getSessionUser(token))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = Create.safeParse(await req.json().catch(() => null));
  if (!b.success) {
    return NextResponse.json({ error: b.error.issues[0]?.message ?? "Invalid template" }, { status: 400 });
  }
  const p = getPool();
  const ws = (await p.query(`SELECT id FROM workspaces WHERE name='NextBiz One' LIMIT 1`)).rows[0].id;
  const name = b.data.name;
  try {
    const r = await p.query(
      `INSERT INTO templates (workspace_id, name, meta_name, category, language, body, variables, status)
       VALUES ($1, $2, $2, $3, $4, $5, $6, 'draft') RETURNING *`,
      [ws, name, b.data.category, b.data.language, b.data.body, b.data.variables ?? []],
    );
    if (!b.data.submit) return NextResponse.json({ ok: true, template: r.rows[0] }, { status: 201 });

    const sub = await submitTemplate({ name, language: b.data.language, category: b.data.category, bodyText: b.data.body });
    if (!sub.ok) {
      return NextResponse.json({ ok: false, error: sub.error, template: r.rows[0] }, { status: 502 });
    }
    const upd = await p.query(
      `UPDATE templates SET status='pending', meta_template_id=$2, updated_at=now() WHERE id=$1 RETURNING *`,
      [r.rows[0].id, sub.id],
    );
    return NextResponse.json({ ok: true, template: upd.rows[0] }, { status: 201 });
  } catch (e) {
    const msg = String(e);
    if (msg.includes("duplicate key")) return NextResponse.json({ error: "A template with that name exists." }, { status: 409 });
    return NextResponse.json({ error: "Couldn't save the template." }, { status: 500 });
  }
}
