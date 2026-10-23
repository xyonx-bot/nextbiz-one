import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { getPool } from "@/lib/db";

/** GET — the whole automation surface state (settings, rules, faq, log). */
export async function GET() {
  const token = (await cookies()).get("nbo_session")?.value;
  const u = await getSessionUser(token);
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const p = getPool();
  const ws = (await p.query(`SELECT id FROM workspaces WHERE name='NextBiz One' LIMIT 1`)).rows[0].id;
  const [settings, rules, faq, log] = await Promise.all([
    p.query(`SELECT * FROM automation_settings WHERE workspace_id=$1`, [ws]),
    p.query(`SELECT * FROM keyword_rules WHERE workspace_id=$1 ORDER BY created_at`, [ws]),
    p.query(`SELECT * FROM faq_pairs WHERE workspace_id=$1 ORDER BY created_at`, [ws]),
    p.query(`SELECT l.type, l.detail, l.status, l.created_at, l.rule_id, c.first_name, c.wa_id
               FROM automation_log l LEFT JOIN contacts c ON c.id = l.contact_id
              WHERE l.workspace_id=$1 ORDER BY l.created_at DESC LIMIT 50`, [ws]),
  ]);
  return NextResponse.json({
    ok: true,
    settings: settings.rows[0] ?? null,
    rules: rules.rows,
    faq: faq.rows,
    log: log.rows,
  });
}
