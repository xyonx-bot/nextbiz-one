import { AppShell } from "@/components/AppShell";
import { BroadcastsClient } from "./BroadcastsClient";

export const dynamic = "force-dynamic";

export default async function BroadcastsPage({ searchParams }: { searchParams: Promise<{ new?: string; to?: string; tpl?: string }> }) {
  const { new: isNew, to, tpl } = await searchParams;
  const preselect = (to ?? "").split(",").filter((s) => /^[0-9a-f-]{36}$/i.test(s));
  return (
    <AppShell active="broadcasts" requires="broadcasts" title="Broadcasts">
      <BroadcastsClient startNew={isNew === "1"} preselect={preselect} templateId={tpl && /^[0-9a-f-]{36}$/i.test(tpl) ? tpl : null} />
    </AppShell>
  );
}
