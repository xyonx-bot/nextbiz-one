import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/lib/db";
import { getTenant, unauthorized } from "@/lib/tenant";

const Set = z.object({
  welcomeEnabled: z.boolean().optional(),
  welcomeText: z.string().trim().max(1024).optional(),
  awayEnabled: z.boolean().optional(),
  awayText: z.string().trim().max(1024).nullable().optional(),
  businessHours: z.record(z.string(), z.tuple([z.string(), z.string()])).optional(),
  channel: z.enum(["whatsapp", "instagram"]).optional(),
});

/** PUT — upsert automation settings (welcome / away / hours). */
export async function PUT(req: Request) {
  const tn = await getTenant();
  if (!tn) return unauthorized();
  const b = Set.safeParse(await req.json().catch(() => null));
  if (!b.success) return NextResponse.json({ error: "Invalid settings" }, { status: 400 });
  const p = getPool();
  const ws = tn.wsId;
  if (b.data.channel === "instagram") {
    // Instagram's own welcome/away; business hours are shared with WhatsApp
    await p.query(`INSERT INTO automation_settings (workspace_id) VALUES ($1) ON CONFLICT (workspace_id) DO NOTHING`, [ws]);
    await p.query(
      `UPDATE automation_settings SET
         ig_welcome_enabled = COALESCE($2, ig_welcome_enabled), ig_welcome_text = COALESCE($3, ig_welcome_text),
         ig_away_enabled = COALESCE($4, ig_away_enabled), ig_away_text = COALESCE($5, ig_away_text),
         business_hours = COALESCE($6, business_hours), updated_at = now()
       WHERE workspace_id = $1`,
      [ws, b.data.welcomeEnabled ?? null, b.data.welcomeText ?? null, b.data.awayEnabled ?? null, b.data.awayText ?? null,
       b.data.businessHours ? JSON.stringify(b.data.businessHours) : null]);
    return NextResponse.json({ ok: true });
  }
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
