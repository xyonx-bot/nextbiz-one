import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { getPool } from "@/lib/db";

async function auth() {
  const token = (await cookies()).get("nbo_session")?.value;
  return getSessionUser(token);
}

/** GET — broadcasts + per-recipient rollups for the list view. */
export async function GET() {
  if (!(await auth())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { rows } = await getPool().query(
    `SELECT b.id, b.name, b.status, b.scheduled_at, b.sent_at, t.name AS template_name,
            (SELECT count(*)::int FROM broadcast_recipients r WHERE r.broadcast_id=b.id) AS total,
            (SELECT count(*)::int FROM broadcast_recipients r WHERE r.broadcast_id=b.id AND r.status='sent') AS sent,
            (SELECT count(*)::int FROM broadcast_recipients r WHERE r.broadcast_id=b.id AND r.status='failed') AS failed
       FROM broadcasts b JOIN templates t ON t.id=b.template_id
      ORDER BY COALESCE(b.scheduled_at, b.created_at) DESC LIMIT 200`,
  );
  return NextResponse.json({ ok: true, broadcasts: rows });
}

const Create = z.object({
  name: z.string().trim().min(1).max(80),
  templateId: z.string().uuid(),
  tag: z.string().trim().max(40).optional(),
  audience: z
    .object({
      mode: z.enum(["all", "contacts"]),
      contactIds: z.array(z.string().uuid()).max(500).optional(),
    })
    .optional(),
  scheduledAt: z.string().datetime().nullable().optional(),
});

/** POST — create broadcast: approved template only, opt-in audience hard rule,
 *  recipient snapshot taken at create time, job queued for the scheduler.
 *  Audience: mode "all" = every opted-in contact; mode "contacts" = only the
 *  picked ids — ALWAYS intersected with opt_in=true (the rule is not bypassable). */
export async function POST(req: Request) {
  if (!(await auth())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = Create.safeParse(await req.json().catch(() => null));
  if (!b.success) return NextResponse.json({ error: "Invalid broadcast" }, { status: 400 });
  const mode = b.data.audience?.mode ?? "all";
  const contactIds = b.data.audience?.contactIds ?? [];
  if (mode === "contacts" && contactIds.length === 0)
    return NextResponse.json({ error: "Select at least one contact." }, { status: 400 });
  const p = getPool();
  const ws = (await p.query(`SELECT id FROM workspaces WHERE name='NextBiz One' LIMIT 1`)).rows[0].id;

  const tpl = await p.query(`SELECT id, status, name FROM templates WHERE id=$1 AND workspace_id=$2`, [b.data.templateId, ws]);
  if (tpl.rows.length === 0) return NextResponse.json({ error: "Template not found" }, { status: 404 });
  if (tpl.rows[0].status !== "approved")
    return NextResponse.json({ error: "Only approved templates can be broadcast" }, { status: 409 });

  // opt-in hard rule: validate the selection BEFORE creating anything
  if (mode === "contacts") {
    const ok = await p.query(
      `SELECT id FROM contacts WHERE workspace_id=$1 AND opt_in=true AND id = ANY($2::uuid[])`,
      [ws, contactIds],
    );
    if (ok.rows.length === 0)
      return NextResponse.json({ error: "None of the selected contacts are opted in." }, { status: 400 });
  }

  try {
    const created = await p.query(
      `INSERT INTO broadcasts (workspace_id, template_id, name, audience_filter, status, scheduled_at)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [ws, b.data.templateId, b.data.name,
       JSON.stringify({
         optInOnly: true, mode,
         ...(b.data.tag ? { tag: b.data.tag } : {}),
         ...(mode === "contacts" ? { selected: contactIds.length } : {}),
       }),
       b.data.scheduledAt ? "scheduled" : "draft",
       b.data.scheduledAt ?? null],
    );
    const bc = created.rows[0];
    // snapshot: mode "contacts" narrows to the picked ids — opt_in=true stays in
    // the WHERE for BOTH paths (hard rule, never trusted to the client alone)
    const snap = await p.query(
      mode === "contacts"
        ? `INSERT INTO broadcast_recipients (broadcast_id, contact_id)
           SELECT $1, c.id FROM contacts c
            WHERE c.opt_in = true AND c.workspace_id = $2 AND c.id = ANY($3::uuid[])
           ON CONFLICT DO NOTHING`
        : `INSERT INTO broadcast_recipients (broadcast_id, contact_id)
           SELECT $1, c.id FROM contacts c WHERE c.opt_in = true AND c.workspace_id = $2
           ON CONFLICT DO NOTHING`,
      mode === "contacts" ? [bc.id, ws, contactIds] : [bc.id, ws],
    );
    const n = snap.rowCount ?? 0;
    if (n === 0) {
      // selection lost its opted-in members between check and snapshot — don't keep an empty shell
      await p.query(`DELETE FROM broadcasts WHERE id=$1`, [bc.id]);
      return NextResponse.json({ error: "None of the selected contacts are opted in." }, { status: 400 });
    }
    if (b.data.scheduledAt) {
      await p.query(
        `INSERT INTO jobs (type, payload, run_at) VALUES ('broadcast_send', $1, $2)`,
        [JSON.stringify({ broadcastId: bc.id }), b.data.scheduledAt],
      );
    }
    return NextResponse.json({ ok: true, broadcast: bc, recipients: n }, { status: 201 });
  } catch (e) {
    if (String(e).includes("duplicate key")) return NextResponse.json({ error: "A broadcast with that name exists." }, { status: 409 });
    return NextResponse.json({ error: "Couldn't create the broadcast." }, { status: 500 });
  }
}
