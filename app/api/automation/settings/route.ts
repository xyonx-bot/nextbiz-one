import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { getPool } from "@/lib/db";

const Set = z.object({
  welcomeEnabled: z.boolean().optional(),
  welcomeText: z.string().trim().max(1024).optional(),
  awayEnabled: z.boolean().optional(),
  awayText: z.string().trim().max(1024).nullable().optional(),
  businessHours: z.record(z.string(), z.tuple([z.string(), z.string()])).optional(),
});

/** PUT — upsert automation settings (welcome / away / hours). */
export async function PUT(req: Request) {
  const token = (await cookies()).get("nbo_session")?.value;
  if (!(await getSessionUser(token))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = Set.safeParse(await req.json().catch(() => null));
  if (!b.success) return NextResponse.json({ error: "Invalid settings" }, { status: 400 });
  const p = getPool();
  const ws = (await p.query(`SELECT id FROM workspaces WHERE name='NextBiz One' LIMIT 1`)).rows[0].id;
  await p.query(
    `INSERT INTO automation_settings (workspace_id, welcome_enabled, welcome_text, away_enabled, away_text, business_hours)
     VALUES ($1, COALESCE($2, true), COALESCE($3, 'Hi! Thanks for reaching out — we usually reply within a day.'),
             COALESCE($4, false), $5, COALESCE($6, '{}'::jsonb))
     ON CONFLICT (workspace_id) DO UPDATE SET
       welcome_enabled = COALESCE($2, automation_settings.welcome_enabled),
       welcome_text = COALESCE($3, automation_settings.welcome_text),
       away_enabled = COALESCE($4, automation_settings.away_enabled),
       away_text = COALESCE($5, automation_settings.away_text),
       business_hours = COALESCE($6, automation_settings.business_hours),
       updated_at = now()`,
    [ws, b.data.welcomeEnabled ?? null, b.data.welcomeText ?? null,
     b.data.awayEnabled ?? null, b.data.awayText ?? null,
     b.data.businessHours ? JSON.stringify(b.data.businessHours) : null],
  );
  return NextResponse.json({ ok: true });
}
