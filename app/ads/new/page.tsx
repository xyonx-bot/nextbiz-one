import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { Shell } from "@/components/Shell";
import { AdsQA } from "@/components/AdsQA";
import { NewCampaignClient } from "./NewCampaignClient";

export const dynamic = "force-dynamic";

/** P2.2 Ads guided creation — 7-step wizard, ported 1:1 from mira ads/create wireframe. */
export default async function AdsNewPage() {
  const token = (await cookies()).get("nbo_session")?.value;
  const user = await getSessionUser(token);
  const initials = (user?.displayName ?? "NBO").split(/\s+/).map((s) => s[0]).join("").slice(0, 2).toUpperCase();
  return (
    <Shell active="ads-new" userInitials={initials} userName={user?.displayName ?? "Operator"} qa={<AdsQA />}>
      <NewCampaignClient />
    </Shell>
  );
}
