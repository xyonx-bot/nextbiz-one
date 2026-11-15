import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { mailOn } from "@/lib/mail";

/** The signed-in person's email preferences. */
async function me() { return getSessionUser((await cookies()).get("nbo_session")?.value); }
export async function GET() {
  const u = await me();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const r = (await getPool().query(`SELECT email_digest FROM users WHERE id = $1`, [u.id])).rows[0];
  return NextResponse.json({ ok: true, digest: !!r?.email_digest, emailOn: mailOn() }, { headers: { "Cache-Control": "no-store" } });
}
export async function PUT(req: Request) {
  const u = await me();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = z.object({ digest: z.boolean() }).safeParse(await req.json().catch(() => null));
  if (!b.success) return NextResponse.json({ error: "Invalid" }, { status: 400 });
  await getPool().query(`UPDATE users SET email_digest = $2 WHERE id = $1`, [u.id, b.data.digest]);
  return NextResponse.json({ ok: true, digest: b.data.digest });
}
