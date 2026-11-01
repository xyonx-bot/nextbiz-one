import { NextResponse } from "next/server";
import { verifyIgSignature, processIgInbound } from "@/lib/instagram";

/**
 * Instagram webhook (r-nbo-ig-access-prep).
 * GET  — Meta verification: hub.mode=subscribe + hub.verify_token match -> echo hub.challenge.
 * POST — X-Hub-Signature-256 HMAC gate against IG_APP_SECRET (forced when set,
 *        optional in dev, same as the WhatsApp route); raw envelope stored BEFORE
 *        processing; DMs/comments become ig_messages/ig_comments rows, idempotent
 *        on Meta ids. Always 200 on valid signature (Meta retries non-2xx).
 * Public callback URL posted in #kira: https://<host>/api/webhooks/instagram
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const expected = process.env.IG_WEBHOOK_VERIFY_TOKEN;
  if (mode === "subscribe" && expected && token === expected && challenge) {
    return new NextResponse(challenge, { status: 200, headers: { "content-type": "text/plain" } });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(req: Request) {
  const raw = await req.text();
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }

  const header = req.headers.get("x-hub-signature-256");
  const valid = verifyIgSignature(raw, header);
  if (process.env.IG_APP_SECRET && !valid) {
    await processIgInbound(body, false); // stored, flagged, not processed
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const result = await processIgInbound(body, true);
  return NextResponse.json({ ok: true, stored: result.stored, duplicate: result.duplicate });
}
