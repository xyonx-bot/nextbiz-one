import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { igOAuthDialogUrl } from "@/lib/instagram";
import { randomBytes } from "node:crypto";

/** Public base for redirects (behind nginx req.url can be the internal one). */
function publicBase(req: Request): string {
  return process.env.PUBLIC_URL ?? new URL(req.url).origin;
}

/**
 * Instagram Business Login start — 302 to Meta's OAuth dialog.
 * Requires a workspace session (prevents open-redirect abuse).
 * redirect_uri is derived from PUBLIC_URL (beta/prod), so the Meta
 * dashboard must have the matching URL registered.
 */
export async function GET(req: Request) {
  const token = (await cookies()).get("nbo_session")?.value;
  const u = await getSessionUser(token);
  const base = publicBase(req);
  if (!u) return NextResponse.redirect(`${base}/login`);
  const appId = process.env.IG_APP_ID || process.env.META_APP_ID;
  if (!appId) {
    return NextResponse.redirect(`${base}/settings?ig=err-noappid`);
  }
  const redirectUri = `${base}/api/auth/instagram/callback`;
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(igOAuthDialogUrl(redirectUri, state, appId, process.env.IG_CONFIG_ID || undefined));
  res.cookies.set("ig_oauth_state", state, {
    httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 1800,
  });
  return res;
}
