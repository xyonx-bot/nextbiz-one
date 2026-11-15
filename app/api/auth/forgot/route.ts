import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { allow, clientIp, tooMany } from "@/lib/ratelimit";
import { createHash, randomBytes } from "crypto";
import { mailOn, sendMail } from "@/lib/mail";
import { resetEmail } from "@/lib/mail-templates";

/** POST { email } — ask for a reset link. Always the same answer, so it never reveals whether an account exists. */
export async function POST(req: Request) {
  if (!allow(`forgot:${clientIp(req)}`, 5, 3600)) return tooMany();
  const b = z.object({ email: z.string().trim().toLowerCase().email().max(160) }).safeParse(await req.json().catch(() => null));
  if (!b.success) return NextResponse.json({ error: "Enter the email you log in with." }, { status: 400 });
  const p = getPool();
  const u = (await p.query(`SELECT id FROM users WHERE email = $1`, [b.data.email])).rows[0];
  if (u) {
    const open = (await p.query(`SELECT 1 FROM password_resets WHERE user_id = $1 AND used_at IS NULL AND requested_at > now() - interval '1 day'`, [u.id])).rows.length;
    if (mailOn()) {
      // email works: send the one-time link straight away (max 3 per day per account)
      const today = (await p.query(`SELECT count(*)::int AS n FROM password_resets WHERE user_id = $1 AND emailed_at > now() - interval '1 day'`, [u.id])).rows[0].n;
      if (today < 3) {
        const token = randomBytes(24).toString("base64url");
        await p.query(`UPDATE password_resets SET used_at = now() WHERE user_id = $1 AND used_at IS NULL`, [u.id]);
        await p.query(`INSERT INTO password_resets (user_id, token_hash, link_created_at, expires_at, emailed_at) VALUES ($1, $2, now(), now() + interval '24 hours', now())`,
          [u.id, createHash("sha256").update(token).digest("hex")]);
        const sent = await sendMail(resetEmail(b.data.email, `${process.env.PUBLIC_URL ?? new URL(req.url).origin}/reset?token=${token}`));
        // email failed → leave an open request for the operator instead
        if (!sent.ok) await p.query(`INSERT INTO password_resets (user_id) VALUES ($1)`, [u.id]);
      }
    } else if (!open) { await p.query(`INSERT INTO password_resets (user_id) VALUES ($1)`, [u.id]); console.log("[auth] password reset requested"); }
  }
  return NextResponse.json({ ok: true, emailed: mailOn() });
}
