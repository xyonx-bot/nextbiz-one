import { AppShell } from "@/components/AppShell";
import { Hint } from "@/components/Hint";
import { NewCampaignClient } from "./NewCampaignClient";

export const dynamic = "force-dynamic";

export default function NewCampaignPage() {
  return (
    <AppShell active="ads-new" requires="ads" title="Create campaign" actions={<a className="btn btn-ghost" href="/ads"><span className="lbl">Cancel</span></a>}>
      <Hint id="ads-new" tone="orange" className="top" title="Match your quick questions to keyword rules" text="If a quick question in the chat is “What’s the price?”, make sure a keyword rule answers it, so every ad lead gets an instant reply. Start with ₹300–500 a day." guide="click-to-whatsapp-ads" />
      <NewCampaignClient />
    </AppShell>
  );
}
