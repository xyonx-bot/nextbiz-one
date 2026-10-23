import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { destroySession, getSessionUser } from "@/lib/auth";
import { getPool } from "@/lib/db";


/** POST — DANGER ZONE. Type-to-confirm workspace self-deletion:
 *  removes contacts, conversations, templates, broadcasts. Cascades are
 *  declared in the migrations; the number release (48h) is Meta-side —
 *  the response notes it. Operator-owned surfaces are never deletable
 *  from here. */
const Del = z.object({ confirmName: z.string().trim().min(2) });

export async function POST(req: Request) {
  const token = (await cookies()).get("nbo_session")?.value;
  const u = await getSessionUser(token);
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = Del.safeParse(await req.json().catch(() => null));
  if (!b.success) return NextResponse.json({ error: "Type the workspace name to confirm." }, { status: 400 });
  const p = getPool();
  const ws = (await p.query(`SELECT id, name FROM workspaces WHERE name = 'NextBiz One' LIMIT 1`)).rows[0];
  if (!ws || b.data.confirmName !== ws.name) {
    return NextResponse.json({ error: "Name doesn't match — nothing was deleted." }, { status: 400 });
  }
  await p.query(`DELETE FROM workspaces WHERE id = $1`, [ws.id]);
  await destroySession(token ?? "");
  return NextResponse.json({ ok: true, note: "Workspace deleted. Your WhatsApp number is released after 48 hours (Meta-side)." });
}
