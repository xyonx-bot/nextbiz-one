import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { requireOperator } from "@/lib/operator";

/** GET — the append-only ledger, recent-first. No update/delete exists. */
export async function GET() {
  const op = await requireOperator();
  if (!op) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { rows } = await getPool().query(
    `SELECT actor_email, action, target, reason, created_at
       FROM audit_log ORDER BY created_at DESC LIMIT 500`,
  );
  return NextResponse.json({ ok: true, entries: rows });
}
