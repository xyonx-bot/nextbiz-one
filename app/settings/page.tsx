import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { Shell } from "@/components/Shell";
import { SettingsClient } from "./SettingsClient";

export const dynamic = "force-dynamic";

/** P0 Settings — leaf page (rail-level, no side panel). */
export default async function SettingsPage() {
  const token = (await cookies()).get("nbo_session")?.value;
  const user = await getSessionUser(token);
  const initials = (user?.displayName ?? "NBO").split(/\s+/).map((s) => s[0]).join("").slice(0, 2).toUpperCase();
  return (
    <Shell active="settings" userInitials={initials} userName={user?.displayName ?? "Operator"}>
      <SettingsClient email={user?.email ?? ""} />
    </Shell>
  );
}
