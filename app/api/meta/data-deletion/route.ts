import { NextResponse } from "next/server";
import { deleteForMetaUser, parseSignedRequest } from "@/lib/meta-signed";

/**
 * Meta Data Deletion Request callback (Facebook Login + Instagram Login app settings).
 * Meta POSTs signed_request; we delete, then answer { url, confirmation_code } — the url shows the status.
 */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const parsed = parseSignedRequest(String(form?.get("signed_request") ?? ""));
  if (!parsed) return NextResponse.json({ error: "invalid signed_request" }, { status: 400 });
  const code = await deleteForMetaUser(parsed.userId, parsed.app);
  const base = process.env.PUBLIC_URL ?? new URL(req.url).origin;
  console.log(`[meta] data deletion from ${parsed.app} → ${code}`);
  return NextResponse.json({ url: `${base}/data-deletion?code=${code}`, confirmation_code: code });
}
