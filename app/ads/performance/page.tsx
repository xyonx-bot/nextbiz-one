import { AppShell } from "@/components/AppShell";
import { PerformanceClient } from "./PerformanceClient";

export const dynamic = "force-dynamic";

export default function AdsPerformancePage() {
  return (
    <AppShell active="ads-perf" title="Performance">
      <PerformanceClient />
    </AppShell>
  );
}
