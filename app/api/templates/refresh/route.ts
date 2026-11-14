import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { getTenant, unauthorized, notFound, isUuid } from "@/lib/tenant";
import { getWaCreds, pollTemplates } from "@/lib/wa-client";

/** POST — pull live statuses from Meta and sync our rows (pending→approved/rejected). */
export async function POST() {
  const t = await getTenant();
  if (!t) return unauthorized();
  const poll = await pollTemplates(await getWaCreds(t.wsId));
  if (!poll.ok) return NextResponse.json({ error: poll.error }, { status: 422 });
  const p = getPool();
  let updated = 0;
  for (const m of poll.templates) {
    const r = await p.query(
      `UPDATE templates
          SET status = $2, rejection_reason = $3, updated_at = now()
        WHERE workspace_id = $4 AND meta_name = $1 AND status IN ('pending','approved','rejected')`,
      [m.metaName, m.status, m.rejectedReason ?? null, t.wsId],
    );
    updated += r.rowCount ?? 0;
  }
  return NextResponse.json({ ok: true, updated });
}
