import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSessionUser, type SessionUser } from "./auth";

/**
 * Tenant = the logged-in user + the workspace (business) they belong to.
 * Every API route and page reads tenant data ONLY through tenant.wsId — never a hard-coded workspace.
 */
export type Tenant = { user: SessionUser; wsId: string };

export async function getTenant(): Promise<Tenant | null> {
  const user = await getSessionUser((await cookies()).get("nbo_session")?.value);
  if (!user?.workspaceId) return null;
  return { user, wsId: user.workspaceId };
}

export const unauthorized = () => NextResponse.json({ error: "unauthorized" }, { status: 401 });
export const notFound = () => NextResponse.json({ error: "not found" }, { status: 404 });
export const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
