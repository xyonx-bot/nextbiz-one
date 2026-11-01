import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { Shell } from "@/components/Shell";
import { AdsQA } from "@/components/AdsQA";
import { AdsClient } from "./AdsClient";

export const dynamic = "force-dynamic";

/** P2.1 Ads campaigns — master-detail, ported 1:1 from mira ads/campaigns wireframe. */
export default async function AdsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const token = (await cookies()).get("nbo_session")?.value;
  const user = await getSessionUser(token);
  const initials = (user?.displayName ?? "NBO").split(/\s+/).map((s) => s[0]).join("").slice(0, 2).toUpperCase();
  const sp = await searchParams;
  const initialStatus =
    sp.status === "DRAFT" || sp.status === "IN_REVIEW" || sp.status === "ACTIVE" || sp.status === "PAUSED"
      ? sp.status
      : "all";
  return (
    <Shell active="ads" userInitials={initials} userName={user?.displayName ?? "Operator"} qa={<AdsQA />}>
      <AdsClient initialStatus={initialStatus} />
    </Shell>
  );
}
