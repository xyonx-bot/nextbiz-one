import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { exchangeIgCode, igLive } from "@/lib/instagram";

/**
 * Instagram Business Login callback — this is the REDIRECT URL to register
 * in Meta App Dashboard → Instagram Business Login.
 *   https://<host>/api/auth/instagram/callback
 *
 * Mock mode (IG_LIVE != "true"): no Graph call; returns an info page so the
 * URL is verifiable without app-review permissions. Live mode: exchanges
 * `code` → IG user token → long-lived → /me, stores ig_accounts row (live),
 * redirects to /settings?ig=connected.
 */
function html(body: string, status = 200) {
  return new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8"><title>Instagram connect</title>
     <style>body{font-family:system-ui,sans-serif;background:#FAF7F2;color:#1A1D23;display:grid;place-items:center;height:100vh;margin:0}
     .c{max-width:420px;background:#fff;border:1px solid #E7E2D9;border-radius:14px;padding:28px;text-align:center}
     h1{font-size:18px;margin:0 0 8px}p{font-size:13px;color:#5A5F6A;line-height:1.5}.b{display:inline-block;margin-top:14px;background:#FF7518;color:#fff;border-radius:9px;padding:9px 18px;font-size:13px;font-weight:700;text-decoration:none}</style>
     </head><body><div class="c">${body}</div></body></html>`,
    { status, headers: { "content-type": "text/html" } },
  );
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = (await cookies()).get("nbo_session")?.value;
  const u = await getSessionUser(token);
  if (!u) return NextResponse.redirect(new URL("/login", req.url));

  const err = url.searchParams.get("error");
  if (err) return html(`<h1>Instagram connect failed</h1><p>Meta returned: ${err}</p><a class="b" href="/settings">Back to Settings</a>`, 200);

  const code = url.searchParams.get("code");
  if (!code) return html(`<h1>Missing code</h1><p>The callback needs a ?code= from Meta.</p><a class="b" href="/settings">Back to Settings</a>`, 400);

  // state check (CSRF): cookie set at /start must match
  const state = url.searchParams.get("state") ?? "";
  const saved = (await cookies()).get("ig_oauth_state")?.value ?? "";
  if (!saved || state !== saved) return html(`<h1>Invalid state</h1><p>Restart the connect from Settings.</p><a class="b" href="/settings">Back to Settings</a>`, 400);

  if (!igLive()) {
    return html(`<h1>Mock mode</h1><p>IG_LIVE is off — Meta app review pending. In live mode this callback exchanges the code for a long-lived IG token and connects the account.</p><a class="b" href="/settings">Back to Settings</a>`);
  }
  const origin = process.env.PUBLIC_URL ?? url.origin;
  const redirectUri = `${origin}/api/auth/instagram/callback`;
  try {
    const { account } = await exchangeIgCode(code, redirectUri);
    const res = NextResponse.redirect(new URL("/settings?ig=connected", req.url));
    res.cookies.delete("ig_oauth_state");
    console.log(`[ig] connected @${account.username ?? account.ig_user_id} via business login`);
    return res;
  } catch (e) {
    return html(`<h1>Connect failed</h1><p>${(e as Error).message}</p><a class="b" href="/settings">Back to Settings</a>`, 502);
  }
}
