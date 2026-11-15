import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { hash } from "bcryptjs";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { allow, clientIp, tooMany } from "@/lib/ratelimit";

const sha = (t: string) => createHash("sha256").update(t).digest("hex");

/** GET ?token= → is the link still valid? · POST { token, password } → set it, sign out every device. */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const r = (await getPool().query(`SELECT u.email FROM password_resets pr JOIN users u ON u.id = pr.user_id WHERE pr.token_hash = $1 AND pr.used_at IS NULL AND pr.expires_at > now()`, [sha(token)])).rows[0];
  return NextResponse.json({ ok: !!r, email: r ? r.email.replace(/^(.).*(@.*)$/, "$1•••$2") : null });
}
export async function POST(req: Request) {
  if (!allow(`reset:${clientIp(req)}`, 10, 900)) return tooMany();
  const b = z.object({ token: z.string().min(20).max(200), password: z.string().min(8, "Use at least 8 characters.").max(200) }).safeParse(await req.json().catch(() => null));
  if (!b.success) return NextResponse.json({ error: b.error.issues[0]?.message ?? "Check the form." }, { status: 400 });
  const p = getPool();
  const r = (await p.query(`SELECT id, user_id FROM password_resets WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()`, [sha(b.data.token)])).rows[0];
  if (!r) return NextResponse.json({ error: "This link has expired or was already used. Ask for a new one." }, { status: 410 });
  await p.query(`UPDATE users SET password_hash = $2 WHERE id = $1`, [r.user_id, await hash(b.data.password, 10)]);
  await p.query(`UPDATE password_resets SET used_at = now() WHERE user_id = $1 AND used_at IS NULL`, [r.user_id]);
  await p.query(`DELETE FROM sessions WHERE user_id = $1`, [r.user_id]);
  return NextResponse.json({ ok: true });
}
