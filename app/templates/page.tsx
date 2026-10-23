import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { Shell } from "@/components/Shell";
import { TemplatesClient } from "./TemplatesClient";

export const dynamic = "force-dynamic";

/** P1.8 Templates — list + editor, ported 1:1 from Mira's templates wireframe. */
export default async function TemplatesPage() {
  const token = (await cookies()).get("nbo_session")?.value;
  const user = await getSessionUser(token);
  const initials = (user?.displayName ?? "NBO").split(/\s+/).map((s) => s[0]).join("").slice(0, 2).toUpperCase();
  return (
    <Shell active="templates" userInitials={initials} userName={user?.displayName ?? "Operator"}>
      <TemplatesClient />
    </Shell>
  );
}
