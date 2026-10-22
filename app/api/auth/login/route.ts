import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession, login } from "@/lib/auth";

const Body = z.object({ email: z.string().trim().min(3).max(160), password: z.string().min(1).max(200) });

export async function POST(req: Request) {
  let parsed: unknown;
  try { parsed = await req.json(); } catch { return NextResponse.json({ error: "Malformed body" }, { status: 400 }); }
  const body = Body.safeParse(parsed);
  if (!body.success) return NextResponse.json({ error: "Email and password are required." }, { status: 400 });

  const user = await login(body.data.email, body.data.password);
  if (!user) {
    // never reveal which part failed
    return NextResponse.json({ error: "Those credentials didn't match. Check them and try again." }, { status: 401 });
  }
  const { token, expiresAt } = await createSession(user.id);
  const res = NextResponse.json({ ok: true });
  res.cookies.set("nbo_session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
  return res;
}
