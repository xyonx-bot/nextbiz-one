import { AppShell } from "@/components/AppShell";
import { Hint } from "@/components/Hint";
import { Icon } from "@/components/Icon";
import { InboxClient } from "./InboxClient";

export const dynamic = "force-dynamic";

/** P1.6 — the live daily surface on the real WhatsApp number. */
export default function InboxPage() {
  return (
    <AppShell active="inbox" requires="inbox" title="Inbox" fixed
      actions={<a className="btn btn-primary" href="/broadcasts?new=1"><Icon name="megaphone" /><span className="lbl">New broadcast</span></a>}>
      <Hint id="api-vs-app" tone="green" className="top" title="Long chats? Continue them on your WhatsApp Business app" text="This number shines at instant replies, broadcasts and catching leads. For long one-to-one conversations, send serious leads your app number." guide="how-to-use-whatsapp-api" />
      <InboxClient />
    </AppShell>
  );
}
