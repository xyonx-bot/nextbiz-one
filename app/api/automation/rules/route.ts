import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { getPool } from "@/lib/db";

const Rule = z.object({
  name: z.string().trim().min(1).max(60),
  keywords: z.array(z.string().trim().min(1).max(40)).min(1).max(12),
  reply: z.string().trim().min(1).max(1024),
  enabled: z.boolean().optional(),
  sendOnce: z.boolean().optional(),
});

async function wsId() {
  return (await getPool().query(`SELECT id FROM workspaces WHERE name='NextBiz One' LIMIT 1`)).rows[0].id;
}

export async function POST(req: Request) {
  const token = (await cookies()).get("nbo_session")?.value;
  if (!(await getSessionUser(token))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = Rule.safeParse(await req.json().catch(() => null));
  if (!b.success) return NextResponse.json({ error: "Rule needs a name, at least one keyword, and a reply." }, { status: 400 });
  const p = getPool();
  try {
    const r = await p.query(
      `INSERT INTO keyword_rules (workspace_id, name, keywords, reply, enabled, send_once)
       VALUES ($1,$2,$3,$4,COALESCE($5,true),COALESCE($6,true)) RETURNING *`,
      [await wsId(), b.data.name, b.data.keywords, b.data.reply, b.data.enabled ?? null, b.data.sendOnce ?? null],
    );
    return NextResponse.json({ ok: true, rule: r.rows[0] }, { status: 201 });
  } catch (e) {
    if (String(e).includes("duplicate key")) return NextResponse.json({ error: "A rule with that name exists." }, { status: 409 });
    return NextResponse.json({ error: "Couldn't save the rule." }, { status: 500 });
  }
}
