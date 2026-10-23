import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";

/** GET ?email= — the status card data (pending/approved/rejected) for the
 *  auth status screen. Only ever exposes: status, business name, timestamps,
 *  reject reason. No session required — email is the lookup key. */
export async function GET(req: Request) {
  const email = (new URL(req.url).searchParams.get("email") ?? "").trim().toLowerCase();
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    return NextResponse.json({ error: "Email required" }, { status: 400 });
  }
  const { rows } = await getPool().query(
    `SELECT business_name, status, reject_reason, created_at, reviewed_at
       FROM access_requests WHERE email = $1
      ORDER BY created_at DESC LIMIT 1`,
    [email],
  );
  if (rows.length === 0) return NextResponse.json({ ok: true, status: "none" });
  return NextResponse.json({ ok: true, ...rows[0] });
}
