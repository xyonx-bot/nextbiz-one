import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { getTenant, unauthorized, notFound, isUuid } from "@/lib/tenant";

/** GET — the whole automation surface state (settings, rules, faq, log). */
export async function GET() {
  const tn = await getTenant();
  if (!tn) return unauthorized();
  const p = getPool();
  const ws = tn.wsId;
  const [settings, rules, faq, log] = await Promise.all([
    p.query(`SELECT * FROM automation_settings WHERE workspace_id=$1`, [ws]),
    p.query(`SELECT * FROM keyword_rules WHERE workspace_id=$1 ORDER BY created_at`, [ws]),
    p.query(`SELECT * FROM faq_pairs WHERE workspace_id=$1 ORDER BY created_at`, [ws]),
    p.query(`SELECT l.type, l.detail, l.status, l.created_at, l.rule_id, c.name, c.wa_id
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
