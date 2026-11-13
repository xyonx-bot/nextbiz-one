import { AppShell } from "@/components/AppShell";
import { Icon } from "@/components/Icon";
import { TemplatesClient } from "./TemplatesClient";

export const dynamic = "force-dynamic";

export default async function TemplatesPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const { new: isNew } = await searchParams;
  return (
    <AppShell active="templates" title="Templates" fixed
      actions={<a className="btn btn-primary" href="/templates?new=1"><Icon name="plus" /><span className="lbl">New template</span></a>}>
      <TemplatesClient startNew={isNew === "1"} />
    </AppShell>
  );
}
