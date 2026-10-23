import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession, login } from "@/lib/auth";
import { compare } from "bcryptjs";

const Body = z.object({ email: z.string().trim().min(3).max(160), password: z.string().min(1).max(200) });

export async function POST(req: Request) {
  let parsed: unknown;
  try { parsed = await req.json(); } catch { return NextResponse.json({ error: "Malformed body" }, { status: 400 }); }
  const body = Body.safeParse(parsed);
  if (!body.success) return NextResponse.json({ error: "Email and password are required." }, { status: 400 });

  // S3 gate: correct creds but no approval yet -> a distinct state, not a
  // generic failure (the client shows the pending/rejected status card).
  {
    const norm = body.data.email.trim().toLowerCase();
    const { rows } = await (await import("@/lib/db")).getPool().query(
      `SELECT u.id, u.password_hash, u.is_approved, r.status AS req_status, r.reject_reason
         FROM users u LEFT JOIN access_requests r ON r.email = u.email AND r.status <> 'approved'
        WHERE u.email = $1 ORDER BY r.created_at DESC LIMIT 1`,
      [norm],
    );
    if (rows.length > 0 && (await compare(body.data.password, rows[0].password_hash)) && !rows[0].is_approved) {
      return NextResponse.json(
        { gated: true, status: rows[0].req_status ?? "pending", rejectReason: rows[0].reject_reason },
        { status: 403 },
      );
    }
  }

  const user = await login(body.data.email, body.data.password);
  if (!user) {
    // never reveal which part failed
    return NextResponse.json({ error: "Those credentials didn't match. Check them and try again." }, { status: 401 });
  }
  const { token, expiresAt } = await createSession(user.id);
  const res = NextResponse.json({ ok: true });
  res.cookies.set("nbo_session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
  return res;
}
