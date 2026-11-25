import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { getTenant, unauthorized } from "@/lib/tenant";
import { testMatch } from "@/lib/automation";

/** POST — inspector test: which rule would fire for this text (never sends). */
export async function POST(req: Request) {
  const tn = await getTenant();
  if (!tn) return unauthorized();
  const body = (await req.json().catch(() => ({}))) as { text?: string; ruleId?: string; channel?: string };
  const chan = body.channel === "instagram" ? "AND (on_instagram_dm OR on_instagram_comment)" : body.channel === "whatsapp" ? "AND on_whatsapp" : "";
  const text = (body.text ?? "").trim();
  if (!text) return NextResponse.json({ error: "Type a sample message first." }, { status: 400 });
  const p = getPool();
  const ws = tn.wsId;
  const { rows } = await p.query(
    `SELECT id, name, keywords, reply FROM keyword_rules WHERE workspace_id=$1 AND enabled ${chan} ORDER BY created_at`, [ws]);
  const res = testMatch(rows, text);
  return NextResponse.json({ ok: true, ...res });
}
