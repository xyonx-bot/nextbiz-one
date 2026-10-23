import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { Shell } from "@/components/Shell";
import { BroadcastsClient } from "./BroadcastsClient";

export const dynamic = "force-dynamic";

/** S2 broadcasts — list + delivery report + 4-step composer, ported 1:1
 *  from Mira's broadcasts/wireframe.html v1 (locked shell v4.3). */
export default async function BroadcastsPage() {
  const token = (await cookies()).get("nbo_session")?.value;
  const user = await getSessionUser(token);
  const initials = (user?.displayName ?? "NBO").split(/\s+/).map((s) => s[0]).join("").slice(0, 2).toUpperCase();
  return (
    <Shell active="broadcasts" userInitials={initials} userName={user?.displayName ?? "Operator"}>
      <BroadcastsClient />
    </Shell>
  );
}
