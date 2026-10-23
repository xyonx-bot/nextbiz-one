import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser, type SessionUser } from "@/lib/auth";
import { getPool } from "@/lib/db";

/** Operator guard — every /api/operator/* route composes this. */
export async function requireOperator(): Promise<SessionUser | null> {
  const token = (await cookies()).get("nbo_session")?.value;
  const u = await getSessionUser(token);
  return u?.isOperator ? u : null;
}

/** GET — pending access requests (the review queue). */
export async function GET() {
  const op = await requireOperator();
  if (!op) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { rows } = await getPool().query(
    `SELECT id, business_name, use_description, email, created_at
       FROM access_requests WHERE status = 'pending' ORDER BY created_at ASC`,
  );
  return NextResponse.json({ ok: true, requests: rows });
}
