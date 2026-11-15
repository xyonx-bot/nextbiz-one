import { AppShell } from "@/components/AppShell";
import { Hint } from "@/components/Hint";
import { AutomationClient } from "@/app/automation/AutomationClient";

export const dynamic = "force-dynamic";

/** NextBiz Social — Auto-replies: Instagram DM + comment rules and Instagram's own welcome/away. */
export default function SocialAutomationPage() {
  return (
    <AppShell active="social-auto" requires="social" title="Auto-replies">
      <Hint id="ig-auto" tone="pink" className="top" title="Comment PRICE → automatic DM" text="Turn on Instagram comment for a keyword rule, then end your post caption with “Comment PRICE”. Everyone who comments gets the answer in their DMs." guide="keyword-rules" />
      <AutomationClient channel="instagram" />
    </AppShell>
  );
}
