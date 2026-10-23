import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { OperatorClient } from "./OperatorClient";

export const dynamic = "force-dynamic";

/** P1.3 Operator admin — separate NBS-internal surface (never in client nav).
 *  Operator session only; everyone else bounces to login. */
export default async function OperatorPage() {
  const token = (await cookies()).get("nbo_session")?.value;
  const user = await getSessionUser(token);
  if (!user) redirect("/login?next=/operator");
  if (!user.isOperator) redirect("/");
  return <OperatorClient operator={user.displayName} email={user.email} />;
}
