import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { compare, hash } from "bcryptjs";
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
  }

  const { token, expiresAt } = await createSession(userId);
  const res = NextResponse.json({ ok: true, operator: isOperator, gated: !isOperator }, { status: 201 });
  res.cookies.set("nbo_session", token, {
    httpOnly: true, sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/", expires: expiresAt,
  });
  return res;
}
