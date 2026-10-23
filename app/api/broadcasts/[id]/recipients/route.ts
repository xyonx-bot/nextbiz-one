import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { getPool } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

const DECODE: Record<number, string> = {
  131026: "not opted in",
  131047: "re-engagement — 24h window closed",
  131049: "number not on WhatsApp",
  131027: "recipient not registered",
};

/** GET — per-recipient report rows (+ rollups). ?format=csv streams a CSV. */
export async function GET(req: Request, ctx: Ctx) {
  const token = (await cookies()).get("nbo_session")?.value;
  if (!(await getSessionUser(token))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const p = getPool();
  const { rows } = await p.query(
    `SELECT r.status, r.sent_at, r.error_raw, r.wa_message_id,
            c.first_name, c.last_name, c.wa_id
       FROM broadcast_recipients r JOIN contacts c ON c.id = r.contact_id
      WHERE r.broadcast_id = $1 ORDER BY r.sent_at DESC NULLS LAST LIMIT 1000`,
    [id],
  );
  const roll = { total: rows.length, sent: 0, delivered: 0, read: 0, failed: 0 } as Record<string, number>;
  for (const r of rows) roll[r.status] = (roll[r.status] ?? 0) + 1;

  const dec = (raw: string | null) => {
    if (!raw) return null;
    const m = raw.match(/\b(131\d{3})\b/);
    return m ? `${m[1]} · ${DECODE[Number(m[1])] ?? "Meta error"}` : raw.slice(0, 60);
  };

  if (new URL(req.url).searchParams.get("format") === "csv") {
    const csv = ["Contact,Number,Status,Sent at,Error"]
      .concat(rows.map((r) =>
        [`${r.first_name ?? ""} ${r.last_name ?? ""}`.trim(), r.wa_id, r.status,
         r.sent_at ? new Date(r.sent_at).toISOString() : "", dec(r.error_raw) ?? ""]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","),
      )).join("\n");
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="broadcast-${id}.csv"`,
      },
    });
  }
  return NextResponse.json({ ok: true, recipients: rows.map((r) => ({ ...r, error: dec(r.error_raw) })), roll });
}
