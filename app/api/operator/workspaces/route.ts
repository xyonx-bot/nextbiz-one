import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { requireOperator } from "../requests/route";

/** GET — workspaces status list (metadata only: name, masked number,
 *  contact count, revoke state). Never message content. */
export async function GET() {
  const op = await requireOperator();
  if (!op) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { rows } = await getPool().query(
    `SELECT w.id, w.name, w.revoked, w.created_at,
            (SELECT count(*)::int FROM contacts c WHERE c.workspace_id = w.id) AS contact_count,
            (SELECT count(*)::int FROM users u WHERE u.workspace_id = w.id AND u.is_operator = false) AS user_count
       FROM workspaces w ORDER BY w.created_at DESC`,
  );
  return NextResponse.json({ ok: true, workspaces: rows });
}
