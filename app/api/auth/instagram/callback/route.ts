import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { exchangeIgCode, igLive } from "@/lib/instagram";

/**
 * Instagram Business Login callback — the REDIRECT URL registered in Meta App Dashboard → Instagram Business Login.
 *   https://<host>/api/auth/instagram/callback
 * Exchanges `code` for a token and stores the connected account. Every outcome returns to Connections, which shows it.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const jar = await cookies();
  const u = await getSessionUser(jar.get("nbo_session")?.value);
  const base = process.env.PUBLIC_URL ?? url.origin;
  if (!u?.workspaceId) return NextResponse.redirect(`${base}/login`);
  const back = (ig: string, msg?: string) => {
    const res = NextResponse.redirect(`${base}/connections?ig=${ig}#instagram`);
    res.cookies.delete("ig_oauth_state");
    // read once by the Connections page (a cookie, not the URL, so a link can't put words in our mouth)
    if (msg) res.cookies.set("ig_flash", msg.slice(0, 200), { sameSite: "lax", secure: true, path: "/connections", maxAge: 60 });
    return res;
  };

  if (url.searchParams.get("error")) return back("err-denied");
  const code = url.searchParams.get("code");
  // state check (CSRF): cookie set at /start must match
  const state = url.searchParams.get("state") ?? "", saved = jar.get("ig_oauth_state")?.value ?? "";
  if (!code || !saved || state !== saved) return back("err-expired");
  if (!igLive()) return back("err-off");
  try {
    const { account } = await exchangeIgCode(u.workspaceId, code, `${base}/api/auth/instagram/callback`);
    console.log(`[ig] connected @${account.username ?? account.ig_user_id} via Instagram Login (webhooks ${account.webhook_subscribed ? "subscribed" : "NOT subscribed"})`);
    return back("connected");
  } catch (e) {
    console.error("[ig] callback exchange failed:", (e as Error).message);
    return back("err", (e as Error).message);
  }
}
