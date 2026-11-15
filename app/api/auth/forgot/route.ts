import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { allow, clientIp, tooMany } from "@/lib/ratelimit";

/** POST { email } — ask for a reset link. Always the same answer, so it never reveals whether an account exists. */
export async function POST(req: Request) {
  if (!allow(`forgot:${clientIp(req)}`, 5, 3600)) return tooMany();
  const b = z.object({ email: z.string().trim().toLowerCase().email().max(160) }).safeParse(await req.json().catch(() => null));
  if (!b.success) return NextResponse.json({ error: "Enter the email you log in with." }, { status: 400 });
  const p = getPool();
  const u = (await p.query(`SELECT id FROM users WHERE email = $1`, [b.data.email])).rows[0];
  if (u) {
    const open = (await p.query(`SELECT 1 FROM password_resets WHERE user_id = $1 AND used_at IS NULL AND requested_at > now() - interval '1 day'`, [u.id])).rows.length;
    if (!open) { await p.query(`INSERT INTO password_resets (user_id) VALUES ($1)`, [u.id]); console.log("[auth] password reset requested"); }
  }
  return NextResponse.json({ ok: true });
}
