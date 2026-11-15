import { NextResponse } from "next/server";
import { deauthorize, parseSignedRequest } from "@/lib/meta-signed";

/** Meta Deauthorize callback: the person removed NextBiz One in their Facebook/Instagram settings. */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const parsed = parseSignedRequest(String(form?.get("signed_request") ?? ""));
  if (!parsed) return NextResponse.json({ error: "invalid signed_request" }, { status: 400 });
  const n = await deauthorize(parsed.userId);
  console.log(`[meta] deauthorize from ${parsed.app}: ${n} account(s) disconnected`);
  return NextResponse.json({ ok: true });
}
