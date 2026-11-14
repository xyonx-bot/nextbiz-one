import { NextResponse } from "next/server";
import { z } from "zod";
import { getTenant, unauthorized } from "@/lib/tenant";
import { completeEmbeddedSignup, waSignupConfig } from "@/lib/wa-signup";

/** GET — what the browser needs to open Meta's Embedded Signup (public ids only, never secrets). */
export async function GET() {
  const t = await getTenant();
  if (!t) return unauthorized();
  const c = waSignupConfig();
  return NextResponse.json({ ok: true, ready: c.ready, appId: c.ready ? c.appId : null, configId: c.ready ? c.configId : null }, { headers: { "Cache-Control": "no-store" } });
}

const Body = z.object({
  code: z.string().min(10).max(2048),
  wabaId: z.string().regex(/^\d{5,30}$/).nullable().optional(),
  phoneNumberId: z.string().regex(/^\d{5,30}$/).nullable().optional(),
});

/** POST — finish the signup: exchange the code, subscribe + register the number, store it on this workspace. */
export async function POST(req: Request) {
  const t = await getTenant();
  if (!t) return unauthorized();
  const b = Body.safeParse(await req.json().catch(() => null));
  if (!b.success) return NextResponse.json({ error: "The connect window didn't return a sign-in code — try again." }, { status: 400 });
  const r = await completeEmbeddedSignup(t.wsId, b.data);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  console.log(`[wa-es] workspace ${t.wsId} connected ${r.phoneNumberId} (registered: ${r.registered})`);
  return NextResponse.json({ ok: true, displayName: r.displayName, registered: r.registered, note: r.note ?? null });
}
