import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { getTenant, unauthorized, notFound, isUuid } from "@/lib/tenant";

/** GET — workspace profile (display phone comes FROM the connection). */
export async function GET() {
  const tn = await getTenant();
  if (!tn) return unauthorized();
  const p = getPool();
  const ws = (await p.query(`SELECT w.name, w.about FROM workspaces w WHERE w.id = $1`, [tn.wsId])).rows[0];
  const conn = (await p.query(`SELECT display_name, status FROM waba_connections WHERE workspace_id = $1 ORDER BY (status = 'connected') DESC, created_at DESC LIMIT 1`, [tn.wsId])).rows[0] ?? null;
  return NextResponse.json({ ok: true, profile: { ...ws, connection: conn } }, { headers: { "Cache-Control": "no-store" } });
}

const Up = z.object({
  businessName: z.string().trim().min(2).max(80).optional(),
  about: z.string().trim().max(500).nullable().optional(),
});

export async function PUT(req: Request) {
  const tn = await getTenant();
  if (!tn) return unauthorized();
  const b = Up.safeParse(await req.json().catch(() => null));
  if (!b.success) return NextResponse.json({ error: "Invalid profile" }, { status: 400 });
  const p = getPool();
  // The business name customers see comes from the WhatsApp connection (Meta-managed).
  if (b.data.businessName !== undefined && b.data.about === undefined) {
    return NextResponse.json({ error: "The business name comes from your WhatsApp profile and is changed in Meta." }, { status: 400 });
  }
  await p.query(`UPDATE workspaces SET about = $1 WHERE id = $2`, [b.data.about ?? null, tn.wsId]);
  return NextResponse.json({ ok: true });
}
