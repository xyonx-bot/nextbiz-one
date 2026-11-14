import { AppShell } from "@/components/AppShell";
import { InboxClient } from "@/app/inbox/InboxClient";

export const dynamic = "force-dynamic";

/** NextBiz Social — Instagram DMs: the inbox, Instagram threads only, without leaving the Social module. */
export default function SocialDmsPage() {
  return (
    <AppShell active="social-dms" requires="social" title="Instagram DMs" fixed>
      <InboxClient only="ig" />
    </AppShell>
  );
}
