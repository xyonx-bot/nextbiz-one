import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { requireOperator } from "@/lib/operator";
import { mailProvider, sendMail } from "@/lib/mail";
import { testEmail } from "@/lib/mail-templates";

/** Operator: email setup status + delivery log · POST { to } sends a test email. */
export async function GET() {
  if (!(await requireOperator())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const p = getPool();
  const log = (await p.query(`SELECT id, to_email, kind, subject, status, provider, error, created_at FROM email_log ORDER BY created_at DESC LIMIT 40`)).rows;
  const week = (await p.query(`SELECT status, count(*)::int AS n FROM email_log WHERE created_at > now() - interval '7 days' GROUP BY status`)).rows;
  return NextResponse.json({ ok: true, provider: mailProvider(), from: process.env.MAIL_FROM || "NextBiz One <hello@nextbizstudio.com>", log,
    week: Object.fromEntries(week.map((r) => [r.status, r.n])) }, { headers: { "Cache-Control": "no-store" } });
}
export async function POST(req: Request) {
  const op = await requireOperator();
  if (!op) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = z.object({ to: z.string().trim().email() }).safeParse(await req.json().catch(() => null));
  const r = await sendMail(testEmail(b.success ? b.data.to : op.email));
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: 422 });
}
