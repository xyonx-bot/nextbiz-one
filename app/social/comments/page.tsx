import { AppShell } from "@/components/AppShell";
import { Hint } from "@/components/Hint";
import { getShellData } from "@/lib/shell";
import { CommentsClient } from "./CommentsClient";

export const dynamic = "force-dynamic";

/** NextBiz Social — Comments: every comment on every post, answered by rules or by hand (public or private). */
export default async function CommentsPage() {
  const shell = await getShellData();
  return (
    <AppShell active="social-comments" requires="social" title="Comments" fixed>
      <Hint id="ig-comments" tone="pink" className="top" title="Public or private?" text="Reply publicly to compliments and general questions; send prices and order details as a private reply. Each comment gets one private reply, within 7 days." guide="instagram-comments" />
      <CommentsClient username={shell.ig?.username ?? null} />
    </AppShell>
  );
}
