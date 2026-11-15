import { AppShell } from "@/components/AppShell";
import { Hint } from "@/components/Hint";
import { AutomationClient } from "./AutomationClient";

export const dynamic = "force-dynamic";

export default function AutomationPage() {
  return (
    <AppShell active="automation" requires="automation" title="Automation">
      <Hint id="automation" tone="banana" className="top" title="New to automation? Do it in this order" text="Welcome message, then business hours and away message, then your top 3 keyword rules (price, delivery, location). Test by messaging your own number." guide="start-automation" />
      <AutomationClient />
    </AppShell>
  );
}
