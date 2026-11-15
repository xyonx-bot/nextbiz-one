import { AppShell } from "@/components/AppShell";
import { Hint } from "@/components/Hint";
import { Icon } from "@/components/Icon";
import { TemplatesClient } from "./TemplatesClient";

export const dynamic = "force-dynamic";

export default async function TemplatesPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const { new: isNew } = await searchParams;
  return (
    <AppShell active="templates" requires="templates" title="Templates" fixed
      actions={<a className="btn btn-primary" href="/templates?new=1"><Icon name="plus" /><span className="lbl">New template</span></a>}>
      <Hint id="templates" tone="green" className="top" title="Templates restart a chat after the 24-hour window" text="No offers in Utility templates, no variables at the very start or end, and realistic sample values: that gets most templates approved first time." guide="templates" />
      <TemplatesClient startNew={isNew === "1"} />
    </AppShell>
  );
}
