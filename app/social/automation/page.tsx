import { AppShell } from "@/components/AppShell";
import { AutomationClient } from "@/app/automation/AutomationClient";

export const dynamic = "force-dynamic";

/** NextBiz Social — Auto-replies: Instagram DM + comment rules and Instagram's own welcome/away. */
export default function SocialAutomationPage() {
  return (
    <AppShell active="social-auto" requires="social" title="Auto-replies">
      <AutomationClient channel="instagram" />
    </AppShell>
  );
}
