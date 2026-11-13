import { AppShell } from "@/components/AppShell";
import { AutomationClient } from "./AutomationClient";

export const dynamic = "force-dynamic";

export default function AutomationPage() {
  return (
    <AppShell active="automation" title="Automation">
      <AutomationClient />
    </AppShell>
  );
}
