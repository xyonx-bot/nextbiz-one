import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { getPool } from "@/lib/db";

const QUERIES: Record<string, string> = {
  contacts: `SELECT c.wa_id, c.first_name, c.last_name, c.opt_in, c.created_at FROM contacts c ORDER BY c.created_at DESC`,
  conversations: `SELECT ct.wa_id, m.direction, m.body, m.status, m.created_at
                   FROM messages m JOIN conversations v ON v.id = m.conversation_id
                   JOIN contacts ct ON ct.id = v.contact_id ORDER BY m.created_at DESC LIMIT 20000`,
  broadcasts: `SELECT b.name, t.name AS template, b.status, r.status AS recipient_status, ct.wa_id, r.sent_at
                 FROM broadcast_recipients r JOIN broadcasts b ON b.id = r.broadcast_id
                 JOIN templates t ON t.id = b.template_id
                 JOIN contacts ct ON ct.id = r.contact_id ORDER BY r.sent_at DESC NULLS LAST LIMIT 20000`,
};

/** GET ?dataset=contacts|conversations|broadcasts — CSV export. Templates
 *  excluded by design (Meta-owned content stays in app). */
export async function GET(req: Request) {
  const token = (await cookies()).get("nbo_session")?.value;
  if (!(await getSessionUser(token))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const ds = new URL(req.url).searchParams.get("dataset") ?? "";
  const q = QUERIES[ds];
  if (!q) return NextResponse.json({ error: "Unknown dataset" }, { status: 400 });
  const { rows } = await getPool().query(q);
  const cols = rows.length > 0 ? Object.keys(rows[0]) : ["empty"];
  const csv = [cols.join(",")].concat(rows.map((r) =>
    cols.map((c) => `"${String(r[c] ?? "").replace(/"/g, '""')}"`).join(","),
  )).join("\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="nbo-${ds}.csv"`,
    },
  });
}
