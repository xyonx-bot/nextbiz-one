import { cookies } from "next/headers";
import { getShellData } from "@/lib/shell";
import { featureUnlocked, type FeatureKey } from "@/lib/channels";
import { ChannelGate } from "./ChannelGate";
import { ShellClient, type ShellActive } from "./ShellClient";

/**
 * Server wrapper: loads shell data (user, unread, workspace, connected channels) once per page render.
 * `requires` names the feature this page belongs to; when none of its channels is connected the page
 * body is replaced by a guided setup state. Ads can be explored with demo data (cookie nbo_ads_demo).
 */
export async function AppShell(props: {
  active: ShellActive;
  title: string;
  actions?: React.ReactNode;
  fixed?: boolean;
  requires?: FeatureKey;
  children: React.ReactNode;
}) {
  const data = await getShellData();
  const { requires, ...rest } = props;
  if (requires && !featureUnlocked(requires, data.channels)) {
    const demo = requires === "ads" && (await cookies()).get("nbo_ads_demo")?.value === "1";
    if (!demo) {
      return <ShellClient {...rest} actions={undefined} fixed={false} data={data}><ChannelGate feature={requires} channels={data.channels} /></ShellClient>;
    }
  }
  return <ShellClient {...rest} data={data} />;
}
