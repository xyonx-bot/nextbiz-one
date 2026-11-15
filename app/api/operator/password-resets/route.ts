import { NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { requireOperator } from "@/lib/operator";

/**
 * Operator: password-reset requests (there's no email service yet, so the operator sends the link).
 * GET → open requests · POST { id } → a one-time link valid for 24 hours (shown once, only its hash is stored).
 */
export async function GET() {
  if (!(await requireOperator())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { rows } = await getPool().query(
    `SELECT pr.id, u.email, u.display_name, w.name AS workspace, pr.requested_at, pr.link_created_at, pr.expires_at
       FROM password_resets pr JOIN users u ON u.id = pr.user_id LEFT JOIN workspaces w ON w.id = u.workspace_id
      WHERE pr.used_at IS NULL AND pr.requested_at > now() - interval '7 days' ORDER BY pr.requested_at DESC LIMIT 50`);
  return NextResponse.json({ ok: true, resets: rows }, { headers: { "Cache-Control": "no-store" } });
}
export async function POST(req: Request) {
  const op = await requireOperator();
  if (!op) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = z.object({ id: z.string().uuid() }).safeParse(await req.json().catch(() => null));
  if (!b.success) return NextResponse.json({ error: "Pick a request." }, { status: 400 });
  const token = randomBytes(24).toString("base64url");
  const r = await getPool().query(
    `UPDATE password_resets SET token_hash = $2, link_created_at = now(), expires_at = now() + interval '24 hours' WHERE id = $1 AND used_at IS NULL RETURNING id`,
    [b.data.id, createHash("sha256").update(token).digest("hex")]);
  if (!r.rowCount) return NextResponse.json({ error: "That request was already used." }, { status: 409 });
  const base = process.env.PUBLIC_URL ?? new URL(req.url).origin;
  return NextResponse.json({ ok: true, url: `${base}/reset?token=${token}` });
}
