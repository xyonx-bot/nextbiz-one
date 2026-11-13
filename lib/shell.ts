import { cookies } from "next/headers";
import { getSessionUser, type SessionUser } from "./auth";
import { getPool } from "./db";

/** Everything the app shell shows on every page — one round trip, read on the server. */
export type ShellData = {
  user: SessionUser | null;
  initials: string;
  userName: string;
  unread: number;
  workspaceName: string;
  wa: { displayName: string | null; connected: boolean } | null;
};

export function initialsOf(name: string) {
  return name.replace(/[^\p{L}\p{N} ]/gu, "").trim().split(/\s+/).map((s) => s[0]).join("").slice(0, 2).toUpperCase() || "?";
}

export async function getShellData(): Promise<ShellData> {
  const token = (await cookies()).get("nbo_session")?.value;
  const user = await getSessionUser(token);
  const userName = user?.displayName ?? "Operator";
  const p = getPool();
  const [unread, ws, wa] = await Promise.all([
    p.query(
      `SELECT count(*)::int AS n FROM messages m
         JOIN conversations c ON c.id = m.conversation_id
        WHERE m.direction = 'in' AND m.created_at > COALESCE(c.last_read_at, to_timestamp(0))`,
    ).catch(() => ({ rows: [{ n: 0 }] })),
    p.query(`SELECT name FROM workspaces WHERE name = 'NextBiz One' LIMIT 1`).catch(() => ({ rows: [] as { name: string }[] })),
    p.query(`SELECT display_name, status FROM waba_connections LIMIT 1`).catch(() => ({ rows: [] as { display_name: string | null; status: string }[] })),
  ]);
  const w = wa.rows[0];
  return {
    user,
    initials: initialsOf(userName),
    userName,
    unread: unread.rows[0]?.n ?? 0,
    // v1 is single-workspace ("NextBiz One" row); the business name customers know comes from the WhatsApp connection
    workspaceName: w?.display_name?.replace(/\s*\(.*\)\s*$/, "").trim() || ws.rows[0]?.name || "My workspace",
    wa: w ? { displayName: w.display_name ?? null, connected: w.status === "connected" } : null,
  };
}
