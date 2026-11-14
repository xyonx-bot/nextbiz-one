import { NextResponse } from "next/server";
import { getTenant, unauthorized } from "@/lib/tenant";
import { syncTemplates } from "@/lib/templates";

/** POST — pull statuses + content from Meta (and templates created in WhatsApp Manager). */
export async function POST() {
  const t = await getTenant();
  if (!t) return unauthorized();
  const r = await syncTemplates(t.wsId);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 422 });
  return NextResponse.json({ ok: true, updated: r.updated + r.added, added: r.added });
}
