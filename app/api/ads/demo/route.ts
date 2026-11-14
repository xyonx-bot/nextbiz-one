import { NextResponse } from "next/server";
import { getTenant } from "@/lib/tenant";

/** GET ?on=1|0&next=/ads — explore NextBiz Ads with demo data (mock-badged) before an ad account is connected. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const base = process.env.PUBLIC_URL ?? url.origin;
  if (!(await getTenant())) return NextResponse.redirect(`${base}/login`);
  const next = url.searchParams.get("next") ?? "/ads";
  const safe = /^\/[a-z/-]*$/.test(next) ? next : "/ads"; // same-site paths only
  // relative Location: stays on whatever host the browser is on (and keeps its session cookie)
  const res = new NextResponse(null, { status: 303, headers: { Location: safe } });
  if (url.searchParams.get("on") === "0") res.cookies.delete("nbo_ads_demo");
  else res.cookies.set("nbo_ads_demo", "1", { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 30 });
  return res;
}
