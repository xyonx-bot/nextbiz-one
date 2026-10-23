import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";

/** P1.2 — request-access intake (no account required; email = channel). */
const Req = z.object({
  businessName: z.string().trim().min(2).max(80),
  useDescription: z.string().trim().min(10).max(600),
  email: z.string().trim().toLowerCase().email(),
});

export async function POST(req: Request) {
  const b = Req.safeParse(await req.json().catch(() => null));
  if (!b.success) {
    return NextResponse.json({ error: "Tell us a bit more (10+ characters) about your intended use." }, { status: 400 });
  }
  const p = getPool();
  const open = await p.query(
    `SELECT id, status FROM access_requests WHERE email = $1 AND status IN ('pending','approved')`,
    [b.data.email],
  );
  if (open.rows.length > 0 && open.rows[0].status === "pending") {
    return NextResponse.json({ error: "You already have a request in review." }, { status: 409 });
  }
  await p.query(
    `INSERT INTO access_requests (business_name, use_description, email)
     VALUES ($1, $2, $3)`,
    [b.data.businessName, b.data.useDescription, b.data.email],
  );
  await p.query(
    `INSERT INTO audit_log (actor_email, action, target) VALUES ($1, 'request_received', $2)`,
    [b.data.email, b.data.businessName],
  );
  return NextResponse.json({ ok: true, status: "pending" }, { status: 201 });
}
