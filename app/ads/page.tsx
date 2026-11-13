import { AppShell } from "@/components/AppShell";
import { Icon } from "@/components/Icon";
import { AdsClient } from "./AdsClient";

export const dynamic = "force-dynamic";

export default async function AdsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const initialStatus = ["ACTIVE", "PAUSED", "IN_REVIEW", "DRAFT", "CANCELLED"].includes(status ?? "") ? status! : null;
  return (
    <AppShell active="ads" title="Campaigns" actions={<a className="btn btn-primary" href="/ads/new" data-testid="qa-btn"><Icon name="plus" /><span className="lbl">New campaign</span></a>}>
      <AdsClient initialStatus={initialStatus} />
    </AppShell>
  );
}
