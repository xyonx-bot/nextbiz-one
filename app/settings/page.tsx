import { getShellData } from "@/lib/shell";
import { ShellClient } from "@/components/ShellClient";
import { SettingsClient } from "./SettingsClient";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const shell = await getShellData();
  return (
    <ShellClient active="settings" title="Settings" data={shell}>
      <SettingsClient email={shell.user?.email ?? ""} displayName={shell.userName} />
    </ShellClient>
  );
}
