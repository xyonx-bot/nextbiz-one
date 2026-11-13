import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { igAppCreds, igOAuthDialogUrl } from "@/lib/instagram";
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
  const { appId } = igAppCreds();
  if (!/^\d{6,}$/.test(appId)) {
    // placeholder / missing Instagram app id → don't send people to an Instagram error page
    return NextResponse.redirect(`${base}/settings?ig=err-noappid#channels`);
  }
  const redirectUri = `${base}/api/auth/instagram/callback`;
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(igOAuthDialogUrl(redirectUri, state, appId));
  res.cookies.set("ig_oauth_state", state, {
    httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 1800,
  });
  return res;
}
