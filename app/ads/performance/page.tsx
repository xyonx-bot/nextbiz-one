import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { Shell } from "@/components/Shell";
import { AdsQA } from "@/components/AdsQA";
import { PerformanceClient } from "./PerformanceClient";

export const dynamic = "force-dynamic";

/** P2.3 Ads performance — ported 1:1 from mira ads/performance wireframe. */
export default async function AdsPerformancePage() {
  const token = (await cookies()).get("nbo_session")?.value;
  const user = await getSessionUser(token);
  const initials = (user?.displayName ?? "NBO").split(/\s+/).map((s) => s[0]).join("").slice(0, 2).toUpperCase();
  return (
    <Shell active="ads-perf" userInitials={initials} userName={user?.displayName ?? "Operator"} qa={<AdsQA />}>
      <PerformanceClient />
    </Shell>
  );
}
