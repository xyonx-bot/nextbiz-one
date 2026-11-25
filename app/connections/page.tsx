import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getShellData } from "@/lib/shell";
import { canReconnectOwnNumber, waSignupConfig } from "@/lib/wa-signup";
import { igAppCreds } from "@/lib/instagram";
import { ShellClient } from "@/components/ShellClient";
import { ConnectionsClient } from "./ConnectionsClient";

export const dynamic = "force-dynamic";

/** Connections — one place to connect WhatsApp, Instagram and Meta ads. Each connects on its own. */
export default async function ConnectionsPage() {
  const shell = await getShellData();
  if (!shell.wsId) redirect("/login?next=/connections");
  const es = waSignupConfig();
  const igReady = /^\d{6,}$/.test(igAppCreds().appId);
  const adsDemo = (await cookies()).get("nbo_ads_demo")?.value === "1";
  return (
    <ShellClient active="connections" title="Connections" data={shell}>
      <ConnectionsClient
        channels={shell.channels}
        wa={shell.wa}
        es={{ ready: es.ready, appId: es.ready ? es.appId : null, configId: es.ready ? es.configId : null }}
        waOwn={!!shell.user?.isOperator && await canReconnectOwnNumber(shell.wsId)}
        igReady={igReady}
        adsDemo={adsDemo}
      />
    </ShellClient>
  );
}
