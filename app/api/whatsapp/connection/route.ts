import { NextResponse } from "next/server";
import { z } from "zod";
import { getTenant, unauthorized } from "@/lib/tenant";
import { disconnectWhatsApp } from "@/lib/wa-signup";

/** DELETE — disconnect this workspace's WhatsApp number (typed confirmation required). */
export async function DELETE(req: Request) {
  const t = await getTenant();
  if (!t) return unauthorized();
  const b = z.object({ confirm: z.literal("DISCONNECT") }).safeParse(await req.json().catch(() => null));
  if (!b.success) return NextResponse.json({ error: "Type DISCONNECT to confirm." }, { status: 400 });
  await disconnectWhatsApp(t.wsId);
  return NextResponse.json({ ok: true });
}
