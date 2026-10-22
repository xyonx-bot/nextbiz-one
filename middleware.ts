import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Hard server-side access gate (plan §2): the gate is the SERVER, not
 * nav-hidden. No valid session -> every app route bounces to /login.
 * API routes self-gate; the webhook is public (signature is its gate).
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = Boolean(req.cookies.get("nbo_session")?.value);
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // middleware guards PAGES only — every /api/* route self-gates
  // (login checks creds; webhook's gate is the HMAC signature)
  matcher: ["/((?!_next|api/|login$|favicon.ico).*)"],
};
