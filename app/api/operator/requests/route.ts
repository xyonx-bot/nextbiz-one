import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { requireOperator } from "@/lib/operator";

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
