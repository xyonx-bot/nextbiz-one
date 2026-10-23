import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { getPool } from "@/lib/db";

/** GET — active sessions for the logged-in user (current one flagged). */
export async function GET() {
  const token = (await cookies()).get("nbo_session")?.value;
  const u = await getSessionUser(token);
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { rows } = await getPool().query(
    `SELECT id, created_at, expires_at, (token = $2) AS current
       FROM sessions WHERE user_id = $1 AND expires_at > now() ORDER BY created_at DESC`,
    [u.id, token],
  );
  return NextResponse.json({ ok: true, sessions: rows });
}
