import { AppShell } from "@/components/AppShell";
import { ContactsClient } from "./ContactsClient";

export const dynamic = "force-dynamic";

export default async function ContactsPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  return (
    <AppShell active="contacts" title="Contacts" fixed>
      <ContactsClient initialId={id} />
    </AppShell>
  );
}
