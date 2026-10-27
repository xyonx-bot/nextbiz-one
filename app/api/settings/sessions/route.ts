import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { getPool } from "@/lib/db";

/** GET — active sessions for the logged-in user (current one flagged). */
export async function GET() {
  const token = (await cookies()).get("nbo_session")?.value;
  const u = await getSessionUser(token);
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // id = md5(token): the sessions table's PK is token — there is NO id column,
  // and a raw `SELECT id` 500'd every call since S4-4 shipped. md5 gives the
  // client a stable, non-reversible handle without ever echoing the token.
  const { rows } = await getPool().query(
    `SELECT md5(token) AS id, created_at, expires_at, (token = $2) AS current
       FROM sessions WHERE user_id = $1 AND expires_at > now() ORDER BY created_at DESC`,
    [u.id, token],
  );
  // no-store: browsers heuristic-cached this GET, so a revoke (DELETE) was
  // invisible until the cache aged out — the row "never went away"
  return NextResponse.json({ ok: true, sessions: rows }, { headers: { "Cache-Control": "no-store" } });
}
