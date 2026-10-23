import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { Shell } from "@/components/Shell";
import { AutomationClient } from "./AutomationClient";

export const dynamic = "force-dynamic";

/** P1.10 Automation — Chat module (shell v4.3, content zone only). */
export default async function AutomationPage() {
  const token = (await cookies()).get("nbo_session")?.value;
  const user = await getSessionUser(token);
  const initials = (user?.displayName ?? "NBO").split(/\s+/).map((s) => s[0]).join("").slice(0, 2).toUpperCase();
  return (
    <Shell active="automation" userInitials={initials} userName={user?.displayName ?? "Operator"}>
      <AutomationClient />
    </Shell>
  );
}
