import { NextResponse } from "next/server";
import { z } from "zod";
import { getTenant, unauthorized } from "@/lib/tenant";
import { disconnectWhatsApp, reconnectOwnNumber } from "@/lib/wa-signup";

const Confirm = z.object({ confirm: z.string().trim().toUpperCase().pipe(z.literal("DISCONNECT")) });

/** DELETE — disconnect this workspace's WhatsApp number (typed confirmation, any letter case). */
export async function DELETE(req: Request) {
  const t = await getTenant();
  if (!t) return unauthorized();
  const b = Confirm.safeParse(await req.json().catch(() => null));
  if (!b.success) return NextResponse.json({ error: "Type DISCONNECT to confirm." }, { status: 400 });
  await disconnectWhatsApp(t.wsId);
  return NextResponse.json({ ok: true });
}

/** POST — switch the platform owner's own number back on (its login lives on the server, so no Facebook login is needed). */
export async function POST() {
  const t = await getTenant();
  if (!t) return unauthorized();
  if (!t.user.isOperator || !(await reconnectOwnNumber(t.wsId))) return NextResponse.json({ error: "This number has to be connected with Facebook." }, { status: 403 });
  return NextResponse.json({ ok: true });
}
