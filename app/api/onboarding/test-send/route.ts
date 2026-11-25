import { NextResponse } from "next/server";
import { getTenant, unauthorized } from "@/lib/tenant";
import { getWaCreds, sendText } from "@/lib/wa-client";

/** P1.4 step 3 — real two-way check: send the test message to the
 *  workspace's own number (the owner's phone). */
export async function POST() {
  const t = await getTenant();
  if (!t) return unauthorized();
  const creds = await getWaCreds(t.wsId);
  const own = creds?.displayName?.match(/\+?\d[\d ]{9,}/)?.[0]?.replace(/\D/g, "");
  if (!creds || !own) return NextResponse.json({ error: "No connected number found — connect WhatsApp first." }, { status: 409 });
  const send = await sendText(creds, own, "This is a test from NextBiz One");
  if (!send.ok) return NextResponse.json({ error: send.error, metaCode: send.metaCode }, { status: 422 });
  return NextResponse.json({ ok: true });
}
