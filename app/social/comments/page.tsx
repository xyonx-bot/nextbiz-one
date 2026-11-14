import { AppShell } from "@/components/AppShell";
import { getShellData } from "@/lib/shell";
import { CommentsClient } from "./CommentsClient";

export const dynamic = "force-dynamic";

/** NextBiz Social — Comments: every comment on every post, answered by rules or by hand (public or private). */
export default async function CommentsPage() {
  const shell = await getShellData();
  return (
    <AppShell active="social-comments" requires="social" title="Comments" fixed>
      <CommentsClient username={shell.ig?.username ?? null} />
    </AppShell>
  );
}
