import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { getPool } from "@/lib/db";

/** GET — workspace profile (display phone comes FROM the connection). */
export async function GET() {
  const token = (await cookies()).get("nbo_session")?.value;
  if (!(await getSessionUser(token))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const p = getPool();
  const ws = (await p.query(`SELECT w.name, w.about FROM workspaces w WHERE w.name='NextBiz One' LIMIT 1`)).rows[0];
  const conn = (await p.query(`SELECT display_name, status FROM waba_connections LIMIT 1`)).rows[0] ?? null;
  return NextResponse.json({ ok: true, profile: { ...ws, connection: conn } }, { headers: { "Cache-Control": "no-store" } });
}

const Up = z.object({
  businessName: z.string().trim().min(2).max(80).optional(),
  about: z.string().trim().max(500).nullable().optional(),
});

export async function PUT(req: Request) {
  const token = (await cookies()).get("nbo_session")?.value;
  if (!(await getSessionUser(token))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = Up.safeParse(await req.json().catch(() => null));
  if (!b.success) return NextResponse.json({ error: "Invalid profile" }, { status: 400 });
  const p = getPool();
  await p.query(
    `UPDATE workspaces SET name = COALESCE($2, name), about = COALESCE($3, about) WHERE name = 'NextBiz One'`,
    [null, b.data.businessName ?? null, b.data.about ?? null],
  );
  return NextResponse.json({ ok: true });
}
