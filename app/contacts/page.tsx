import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { Shell } from "@/components/Shell";
import { ContactsClient } from "./ContactsClient";

export const dynamic = "force-dynamic";

/** P1.7 Contacts — master-detail, ported 1:1 from Mira's contacts wireframe. */
export default async function ContactsPage() {
  const token = (await cookies()).get("nbo_session")?.value;
  const user = await getSessionUser(token);
  const initials = (user?.displayName ?? "NBO").split(/\s+/).map((s) => s[0]).join("").slice(0, 2).toUpperCase();
  return (
    <Shell active="contacts" userInitials={initials} userName={user?.displayName ?? "Operator"}>
      <ContactsClient />
    </Shell>
  );
}
