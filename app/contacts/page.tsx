import { AppShell } from "@/components/AppShell";
import { Hint } from "@/components/Hint";
import { ContactsClient } from "./ContactsClient";

export const dynamic = "force-dynamic";

export default async function ContactsPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  return (
    <AppShell active="contacts" requires="contacts" title="Contacts" fixed>
      <Hint id="contacts" tone="green" className="top" title="Tag as you chat" text="Tags like New lead, Wholesale or VIP turn one long list into segments you can broadcast to, and help you spot leads to move to your WhatsApp Business app." guide="grow-contacts" />
      <ContactsClient initialId={id} />
    </AppShell>
  );
}
