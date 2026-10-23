import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { requireOperator } from "@/lib/operator";

/** GET — the append-only ledger, recent-first. No update/delete exists. */
export async function GET(req: Request) {
  const op = await requireOperator();
  if (!op) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { rows } = await getPool().query(
    `SELECT actor_email, action, target, reason, created_at
       FROM audit_log ORDER BY created_at DESC LIMIT 500`,
  );
  if (new URL(req.url).searchParams.get("format") === "csv") {
    const csv = ["When,Action,Target,Reason,Actor"]
      .concat(rows.map((r) =>
        [r.created_at, r.action, r.target, r.reason ?? "", r.actor_email]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","),
      )).join("\n");
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="nbo-audit.csv"',
      },
    });
  }
  return NextResponse.json({ ok: true, entries: rows });
}
