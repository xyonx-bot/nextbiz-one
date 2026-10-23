import { cookies } from "next/headers";
import { getSessionUser, type SessionUser } from "@/lib/auth";

/** Operator guard — shared by every /api/operator/* route. */
export async function requireOperator(): Promise<SessionUser | null> {
  const token = (await cookies()).get("nbo_session")?.value;
  const u = await getSessionUser(token);
  return u?.isOperator ? u : null;
}
