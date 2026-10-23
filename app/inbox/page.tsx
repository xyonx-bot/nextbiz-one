import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { Shell } from "@/components/Shell";
import { InboxClient } from "./InboxClient";

export const dynamic = "force-dynamic";

/** P1.6 — the LIVE daily surface on the real WABA. */
export default async function InboxPage() {
  const token = (await cookies()).get("nbo_session")?.value;
  const user = await getSessionUser(token);
  const initials = (user?.displayName ?? "NBO").split(/\s+/).map((s) => s[0]).join("").slice(0, 2).toUpperCase();
  const { rows } = await getPool().query(
    `SELECT count(*)::int AS unread FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
      WHERE m.direction = 'in' AND m.created_at > COALESCE(c.last_read_at, to_timestamp(0))`,
  );
  return (
    <Shell active="inbox" userInitials={initials} userName={user?.displayName ?? "Operator"} unread={rows[0]?.unread ?? 0}>
      <InboxClient />
    </Shell>
  );
}
