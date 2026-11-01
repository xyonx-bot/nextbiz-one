import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { igOAuthDialogUrl } from "@/lib/instagram";
import { randomBytes } from "node:crypto";

/**
 * Instagram Business Login start — 302 to Meta's OAuth dialog.
 * Requires a workspace session (prevents open-redirect abuse).
 * The redirect_uri is derived from the request origin, so beta and prod
 * both work; Meta dashboard must have the matching URL registered.
 */
export async function GET(req: Request) {
  const token = (await cookies()).get("nbo_session")?.value;
  const u = await getSessionUser(token);
  if (!u) return NextResponse.redirect(new URL("/login", req.url));
  const appId = process.env.IG_APP_ID;
  if (!appId) {
    return NextResponse.redirect(new URL("/settings?ig=err-noappid", req.url));
  }
  const origin = process.env.PUBLIC_URL ?? new URL(req.url).origin;
  const redirectUri = `${origin}/api/auth/instagram/callback`;
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(igOAuthDialogUrl(redirectUri, state, appId));
  res.cookies.set("ig_oauth_state", state, {
    httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 600,
  });
  return res;
}
