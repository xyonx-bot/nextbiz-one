import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { pollTemplates } from "@/lib/wa-client";

/** POST — pull live statuses from Meta and sync our rows (pending→approved/rejected). */
export async function POST() {
  const token = (await cookies()).get("nbo_session")?.value;
  if (!(await getSessionUser(token))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const poll = await pollTemplates();
  if (!poll.ok) return NextResponse.json({ error: poll.error }, { status: 502 });
  const p = getPool();
  let updated = 0;
  for (const t of poll.templates) {
    const r = await p.query(
      `UPDATE templates
          SET status = $2, rejection_reason = $3, updated_at = now()
        WHERE meta_name = $1 AND status IN ('pending','approved','rejected')`,
      [t.metaName, t.status, t.rejectedReason ?? null],
    );
    updated += r.rowCount ?? 0;
  }
  return NextResponse.json({ ok: true, updated });
}
