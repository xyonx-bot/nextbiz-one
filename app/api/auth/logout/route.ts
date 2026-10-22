import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth";

export async function POST(req: Request) {
  const jar = req.headers.get("cookie") ?? "";
  const token = /(?:^|;\\s*)nbo_session=([^;]+)/.exec(jar)?.[1];
  if (token) await destroySession(token).catch(() => {});
  const res = NextResponse.json({ ok: true });
  res.cookies.set("nbo_session", "", { path: "/", maxAge: 0 });
  return res;
}
