import { notifyNewRequest } from "@/lib/mail-notify";
import { allow, clientIp, tooMany } from "@/lib/ratelimit";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { hash } from "bcryptjs";
import { createSession } from "@/lib/auth";

/**
 * P1.1 Signup — creates the account + access request in one go.
 * Access stays GATED: no workspace until an operator approves.
 * Operator bootstrap: first signup matching OPERATOR_EMAIL becomes operator.
 */
const Signup = z.object({
  businessName: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(72),
});

export async function POST(req: Request) {
  if (!allow(`signup:${clientIp(req)}`, 30, 3600)) return tooMany();
  const b = Signup.safeParse(await req.json().catch(() => null));
  if (!b.success) {
    return NextResponse.json({ error: b.error.issues[0]?.message ?? "Invalid signup" }, { status: 400 });
  }
  const p = getPool();
  const { businessName, email, password } = b.data;

  const existing = await p.query(`SELECT id, is_approved, is_operator FROM users WHERE email = $1`, [email]);
  if (existing.rows.length > 0) {
    return NextResponse.json({ error: "An account with this email already exists — log in instead." }, { status: 409 });
  }

  const passwordHash = await hash(password, 10);
  const isOperator = email === (process.env.OPERATOR_EMAIL ?? "").trim().toLowerCase();
  // approved through "Request access" (no account yet): the workspace is waiting — join it, no second review
  const pre = (await p.query(`SELECT id, workspace_id FROM access_requests WHERE email = $1 AND status = 'approved' AND user_id IS NULL AND workspace_id IS NOT NULL ORDER BY reviewed_at DESC LIMIT 1`, [email])).rows[0];
  if (pre && !isOperator) {
    const u = await p.query(`INSERT INTO users (email, password_hash, display_name, is_operator, is_approved, workspace_id) VALUES ($1, $2, $3, false, true, $4) RETURNING id`, [email, passwordHash, businessName, pre.workspace_id]);
    await p.query(`UPDATE access_requests SET user_id = $2 WHERE id = $1`, [pre.id, u.rows[0].id]);
    const s = await createSession(u.rows[0].id, req.headers.get("user-agent"));
    const res = NextResponse.json({ ok: true, operator: false, gated: false }, { status: 201 });
    res.cookies.set("nbo_session", s.token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", expires: s.expiresAt });
    return res;
  }
  const user = await p.query(
    `INSERT INTO users (email, password_hash, display_name, is_operator, is_approved)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [email, passwordHash, businessName, isOperator, isOperator],
  );
  const userId = user.rows[0].id;

  if (!isOperator) {
    await p.query(
      `INSERT INTO access_requests (business_name, use_description, email, user_id)
       VALUES ($1, $2, $3, $4)`,
      [businessName, "Signed up via signup form", email, userId],
    );
    await p.query(
      `INSERT INTO audit_log (actor_email, action, target) VALUES ($1, 'request_received', $2)`,
      [email, businessName],
    );
    void notifyNewRequest({ business: businessName, email, use: "Created an account on the sign-up page" }).catch(() => {});
  }

  const { token, expiresAt } = await createSession(userId, req.headers.get("user-agent"));
  const res = NextResponse.json({ ok: true, operator: isOperator, gated: !isOperator }, { status: 201 });
  res.cookies.set("nbo_session", token, {
    httpOnly: true, sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/", expires: expiresAt,
  });
  return res;
}
