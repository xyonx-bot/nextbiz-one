import { AppShell } from "@/components/AppShell";
import { NewCampaignClient } from "./NewCampaignClient";

export const dynamic = "force-dynamic";

export default function NewCampaignPage() {
  return (
    <AppShell active="ads-new" title="Create campaign" actions={<a className="btn btn-ghost" href="/ads"><span className="lbl">Cancel</span></a>}>
      <NewCampaignClient />
    </AppShell>
  );
}
