/**
 * Instagram comment sync — pulls comments straight from the Graph API so the Comments page is complete
 * even when live webhooks don't arrive (before App Review, Instagram only pushes events for people with a
 * role on the app) and for comments made before the account was connected.
 *
 * · Never triggers automation: synced comments are only shown; auto-replies run on live webhook events.
 * · A reply the account made in the Instagram app (or by another tool) counts as answered (owner_reply_*).
 * · Idempotent on Meta's comment id; webhook rows keep their automation status.
 */
import { getPool } from "./db";
import { igLive } from "./instagram";

const G = "https://graph.instagram.com/v21.0";
type GComment = { id: string; text?: string; timestamp?: string; username?: string; from?: { id?: string; username?: string };
  replies?: { data?: GComment[] } };

async function gget<T>(path: string, token: string): Promise<T | null> {
  try {
    const r = await fetch(`${G}${path}${path.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(8000) });
    return r.ok ? ((await r.json()) as T) : null;
  } catch { return null; }
}

const running = new Set<string>();

export async function syncIgComments(accountId: string, opts: { posts?: number } = {}): Promise<{ ok: boolean; posts: number; imported: number; answered: number; error?: string }> {
  if (!igLive()) return { ok: true, posts: 0, imported: 0, answered: 0 };
  if (running.has(accountId)) return { ok: true, posts: 0, imported: 0, answered: 0 };
  running.add(accountId);
  try {
    const p = getPool();
    const a = (await p.query(`SELECT id, ig_user_id, username, access_token, live FROM ig_accounts WHERE id = $1`, [accountId])).rows[0];
    if (!a?.live || !a.access_token) return { ok: false, posts: 0, imported: 0, answered: 0, error: "Instagram isn't connected" };
    const me = String(a.username ?? "").replace(/^@/, "").toLowerCase();
    const isOwner = (c: GComment) => c.from?.id === a.ig_user_id || (c.username ?? c.from?.username ?? "").toLowerCase() === me;

    const media = await gget<{ data?: { id: string; comments_count?: number }[] }>(`/me/media?fields=id,comments_count&limit=${opts.posts ?? 15}`, a.access_token);
    if (!media) return { ok: false, posts: 0, imported: 0, answered: 0, error: "Couldn't read posts from Instagram" };
    const withComments = (media.data ?? []).filter((m) => (m.comments_count ?? 0) > 0);

    let imported = 0, answered = 0;
    const lists = await Promise.all(withComments.map(async (m) => ({
      mediaId: m.id,
      comments: (await gget<{ data?: GComment[] }>(`/${m.id}/comments?fields=id,text,timestamp,username,from,replies{id,text,timestamp,username,from}&limit=50`, a.access_token))?.data ?? [],
    })));
    for (const { mediaId, comments } of lists) {
      // Instagram leaves the author off nested replies, but lists those replies again at the top level WITH it —
      // so a reply is ours when its id matches one of our own top-level items.
      const ownIds = new Map(comments.filter(isOwner).map((c) => [c.id, c]));
      for (const c of comments) {
        if (isOwner(c)) continue; // our own comments/replies aren't customer comments
        const ownerReplies = (c.replies?.data ?? []).map((r) => ownIds.get(r.id) ?? (isOwner(r) ? r : null)).filter((r): r is GComment => !!r)
          .sort((x, y) => String(x.timestamp).localeCompare(String(y.timestamp)));
        const last = ownerReplies[ownerReplies.length - 1];
        const r = await p.query(
          `INSERT INTO ig_comments (ig_account_id, comment_id, from_id, from_name, media_id, text, raw, created_at, source, owner_reply_text, owner_replied_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, COALESCE($8::timestamptz, now()), 'sync', $9, $10::timestamptz)
           ON CONFLICT (comment_id) DO UPDATE SET
             owner_reply_text = COALESCE(EXCLUDED.owner_reply_text, ig_comments.owner_reply_text),
             owner_replied_at = COALESCE(EXCLUDED.owner_replied_at, ig_comments.owner_replied_at),
             from_name = COALESCE(ig_comments.from_name, EXCLUDED.from_name),
             media_id = COALESCE(ig_comments.media_id, EXCLUDED.media_id)
           RETURNING (xmax = 0) AS inserted`,
          [accountId, c.id, c.from?.id ?? null, c.username ?? c.from?.username ?? null, mediaId, c.text ?? null, JSON.stringify(c),
           c.timestamp ?? null, last?.text ?? null, last?.timestamp ?? null]);
        if (r.rows[0]?.inserted) imported++;
        if (last) answered++;
      }
    }
    await p.query(`UPDATE ig_accounts SET comments_synced_at = now() WHERE id = $1`, [accountId]);
    return { ok: true, posts: withComments.length, imported, answered };
  } finally { running.delete(accountId); }
}

/** Sync a workspace's account if it hasn't been synced for `staleMs`. */
export async function syncIfStale(wsId: string, staleMs = 3 * 60_000) {
  const a = (await getPool().query(
    `SELECT id, comments_synced_at FROM ig_accounts WHERE workspace_id = $1 AND live ORDER BY updated_at DESC LIMIT 1`, [wsId])).rows[0];
  if (!a) return null;
  if (a.comments_synced_at && Date.now() - new Date(a.comments_synced_at).getTime() < staleMs) return null;
  return syncIgComments(a.id);
}

/** Background job: every live account, every few minutes. */
export async function syncAllIgComments() {
  if (!igLive()) return;
  const { rows } = await getPool().query(`SELECT id FROM ig_accounts WHERE live AND access_token IS NOT NULL`);
  for (const r of rows) await syncIgComments(r.id).catch(() => null);
}
