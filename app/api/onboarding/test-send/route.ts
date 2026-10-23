import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { sendText } from "@/lib/wa-client";

/** P1.4 step 3 — real two-way check: send the test message to the
 *  workspace's own number (the owner's phone). */
export async function POST() {
  const token = (await cookies()).get("nbo_session")?.value;
  const u = await getSessionUser(token);
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const p = getPool();
  const wc = await p.query(`SELECT display_name FROM waba_connections LIMIT 1`);
  const own = wc.rows[0]?.display_name?.match(/\+?\d[\d ]{9,}/)?.[0]?.replace(/\D/g, "");
  if (!own) return NextResponse.json({ error: "No connected number found — connect WhatsApp first." }, { status: 409 });
  const send = await sendText(own, "This is a test from NextBiz One");
  if (!send.ok) return NextResponse.json({ error: send.error, metaCode: send.metaCode }, { status: 502 });
  return NextResponse.json({ ok: true });
}
