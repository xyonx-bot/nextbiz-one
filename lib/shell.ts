import { cookies } from "next/headers";
import { getSessionUser, type SessionUser } from "./auth";
import { getPool } from "./db";
import { aiAvailable } from "./ai";

/** Everything the app shell shows on every page — one round trip, read on the server. */
export type ShellData = {
  user: SessionUser | null;
  wsId: string | null;
  initials: string;
  userName: string;
  unread: number;
  workspaceName: string;
  wa: { displayName: string | null; connected: boolean } | null;
  /** Which channels this workspace has connected — pages show a guided setup state for the missing ones. */
  channels: { whatsapp: boolean; instagram: boolean; ads: boolean };
  ig: { username: string | null; picture: string | null } | null;
  adAccount: { id: string; name: string | null } | null;
  /** NextBiz AI switched on (operator setting + server key) */
  ai: boolean;
};

export function initialsOf(name: string) {
  return name.replace(/[^\p{L}\p{N} ]/gu, "").trim().split(/\s+/).map((s) => s[0]).join("").slice(0, 2).toUpperCase() || "?";
}

export async function getShellData(): Promise<ShellData> {
  const token = (await cookies()).get("nbo_session")?.value;
  const user = await getSessionUser(token);
  const userName = user?.displayName ?? "Operator";
  const wsId = user?.workspaceId ?? null;
  const p = getPool();
  const none = { rows: [] as Record<string, never>[] };
  const [unread, ws, wa, ig, ads] = wsId ? await Promise.all([
    p.query(
      `SELECT count(*)::int AS n FROM messages m
         JOIN conversations c ON c.id = m.conversation_id
        WHERE c.workspace_id = $1 AND m.direction = 'in' AND m.created_at > COALESCE(c.last_read_at, to_timestamp(0))`, [wsId],
    ).catch(() => ({ rows: [{ n: 0 }] })),
    p.query(`SELECT name FROM workspaces WHERE id = $1`, [wsId]).catch(() => none),
    p.query(`SELECT display_name, status FROM waba_connections WHERE workspace_id = $1 ORDER BY (status = 'connected') DESC, created_at DESC LIMIT 1`, [wsId]).catch(() => none),
    p.query(`SELECT username, profile_picture_url FROM ig_accounts WHERE workspace_id = $1 AND live ORDER BY updated_at DESC LIMIT 1`, [wsId]).catch(() => none),
    p.query(`SELECT ad_account_id, name FROM ads_connections WHERE workspace_id = $1`, [wsId]).catch(() => none),
  ]) : [{ rows: [{ n: 0 }] }, none, none, none, none];
  const w = wa.rows[0] as { display_name: string | null; status: string } | undefined;
  const waConnected = w?.status === "connected";
  return {
    user,
    wsId,
    initials: initialsOf(userName),
    userName,
    unread: (unread.rows[0] as { n?: number } | undefined)?.n ?? 0,
    // the business name customers know comes from the WhatsApp connection; else the workspace name
    workspaceName: w?.display_name?.replace(/\s*\(.*\)\s*$/, "").trim() || (ws.rows[0] as { name?: string } | undefined)?.name || "My workspace",
    wa: w ? { displayName: w.display_name ?? null, connected: waConnected } : null,
    channels: { whatsapp: waConnected, instagram: ig.rows.length > 0, ads: ads.rows.length > 0 },
    ai: await aiAvailable().catch(() => false),
    adAccount: ads.rows[0] ? { id: (ads.rows[0] as { ad_account_id: string }).ad_account_id, name: (ads.rows[0] as { name: string | null }).name } : null,
    ig: ig.rows[0] ? { username: (ig.rows[0] as { username: string | null }).username, picture: (ig.rows[0] as { profile_picture_url: string | null }).profile_picture_url } : null,
  };
}
