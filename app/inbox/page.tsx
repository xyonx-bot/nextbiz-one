import { AppShell } from "@/components/AppShell";
import { Icon } from "@/components/Icon";
import { InboxClient } from "./InboxClient";

export const dynamic = "force-dynamic";

/** P1.6 — the live daily surface on the real WhatsApp number. */
export default function InboxPage() {
  return (
    <AppShell active="inbox" title="Inbox" fixed
      actions={<a className="btn btn-primary" href="/broadcasts?new=1"><Icon name="megaphone" /><span className="lbl">New broadcast</span></a>}>
      <InboxClient />
    </AppShell>
  );
}
