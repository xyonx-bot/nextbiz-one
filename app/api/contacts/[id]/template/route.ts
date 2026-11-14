import { NextResponse } from "next/server";
import { z } from "zod";
import { getTenant, unauthorized, notFound, isUuid } from "@/lib/tenant";
import { sendTemplateToContact } from "@/lib/templates";

const Body = z.object({ templateId: z.string().uuid(), params: z.array(z.string().max(1000)).max(20).default([]) });

/** POST — send one approved template to this contact (restarts a closed chat, or starts a new one). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const t = await getTenant();
  if (!t) return unauthorized();
  const { id } = await ctx.params;
  if (!isUuid(id)) return notFound();
  const b = Body.safeParse(await req.json().catch(() => null));
  if (!b.success) return NextResponse.json({ error: "Pick a template." }, { status: 400 });
  const r = await sendTemplateToContact(t.wsId, id, b.data.templateId, b.data.params);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true, conversationId: r.conversationId, message: r.message });
}
