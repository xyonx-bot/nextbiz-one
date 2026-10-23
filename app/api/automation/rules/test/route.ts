import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { testMatch } from "@/lib/automation";

/** POST — inspector test: which rule would fire for this text (never sends). */
export async function POST(req: Request) {
  const token = (await cookies()).get("nbo_session")?.value;
  if (!(await getSessionUser(token))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { text?: string; ruleId?: string };
  const text = (body.text ?? "").trim();
  if (!text) return NextResponse.json({ error: "Type a sample message first." }, { status: 400 });
  const p = getPool();
  const ws = (await p.query(`SELECT id FROM workspaces WHERE name='NextBiz One' LIMIT 1`)).rows[0].id;
  const { rows } = await p.query(
    `SELECT id, name, keywords, reply FROM keyword_rules WHERE workspace_id=$1 AND enabled ORDER BY created_at`, [ws]);
  const res = testMatch(rows, text);
  return NextResponse.json({ ok: true, ...res });
}
