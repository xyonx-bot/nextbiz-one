import { NextResponse } from "next/server";
import { verifySignature, processInbound } from "@/lib/webhook";

/**
 * GET  — Meta webhook verification (hub.challenge echo on token match).
 * POST — X-Hub-Signature-256 HMAC gate; raw envelope stored BEFORE
 *        processing; inbound messages become contact/conversation/message
 *        rows. S0 acceptance: Joydip's "hi" lands in `messages`.
 *        Always 200 on valid signature (Meta retries non-2xx).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const expected = process.env.WHATSAPP_VERIFY_TOKEN;
  if (mode === "subscribe" && expected && token === expected && challenge) {
    return new NextResponse(challenge, { status: 200, headers: { "content-type": "text/plain" } });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(req: Request) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  const raw = await req.text();
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }

  // signature optional in dev (unset secret) but FORCED when configured
  const header = req.headers.get("x-hub-signature-256");
  const valid = secret ? verifySignature(raw, header, secret) : true;
  if (secret && !valid) {
    await processInbound(body, false); // stored, flagged, not processed
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const result = await processInbound(body, true);
  return NextResponse.json({ ok: true, stored: result.stored });
}
