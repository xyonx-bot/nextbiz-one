/**
 * NextBiz Social (Instagram) — server-side reads for the Overview and Comments pages.
 * Everything is scoped to one workspace through its connected Instagram account.
 * Live profile/post data comes from the Instagram Graph API (cached briefly); without a live
 * account (tests, mock mode) those parts are simply empty and the pages fall back gracefully.
 */
import { getPool } from "./db";
import { igLive, igMediaInfo, type IgMedia } from "./instagram";
import { DEMO_PROFILE, demoPosts, isDemoId } from "./demo";

const IG_GRAPH = "https://graph.instagram.com/v21.0";

export type SocialAccount = {
  id: string; ig_user_id: string; username: string | null; display_name: string | null; profile_picture_url: string | null;
  live: boolean; webhook_subscribed: boolean | null; expires_at: string | null; last_error: string | null; access_token: string | null;
};

/** The workspace's Instagram account (the live one when there is one). */
export async function socialAccount(wsId: string): Promise<SocialAccount | null> {
  const { rows } = await getPool().query(
    `SELECT id, ig_user_id, username, display_name, profile_picture_url, live, webhook_subscribed, expires_at, last_error, access_token
       FROM ig_accounts WHERE workspace_id = $1 AND live ORDER BY updated_at DESC LIMIT 1`, [wsId]);
  return (rows[0] as SocialAccount) ?? null;
}

/* ── live Graph reads (cached) ── */
const cache = new Map<string, { at: number; v: unknown }>();
async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const c = cache.get(key); if (c && Date.now() - c.at < ttlMs) return c.v as T;
  const v = await fn(); cache.set(key, { at: Date.now(), v }); return v;
}
async function gget(path: string, token: string): Promise<Record<string, unknown> | null> {
  try {
    const r = await fetch(`${IG_GRAPH}${path}${path.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(6000) });
    return r.ok ? ((await r.json()) as Record<string, unknown>) : null;
  } catch { return null; }
}

export type IgProfile = { followers: number | null; follows: number | null; posts: number | null; picture: string | null; name: string | null };
export async function socialProfile(a: SocialAccount): Promise<IgProfile> {
  const empty: IgProfile = { followers: null, follows: null, posts: null, picture: a.profile_picture_url, name: a.display_name };
  if (isDemoId(a.ig_user_id)) return { ...DEMO_PROFILE, picture: a.profile_picture_url, name: a.display_name };
  if (!igLive() || !a.access_token) return empty;
  return cached(`prof:${a.id}`, 10 * 60_000, async () => {
    const j = await gget(`/me?fields=followers_count,follows_count,media_count,profile_picture_url,name`, a.access_token!);
    if (!j) return empty;
    return { followers: (j.followers_count as number) ?? null, follows: (j.follows_count as number) ?? null, posts: (j.media_count as number) ?? null,
      picture: (j.profile_picture_url as string) ?? a.profile_picture_url, name: (j.name as string) ?? a.display_name };
  });
}

export type IgPost = { id: string; caption: string | null; type: string; thumb: string | null; permalink: string | null; at: string | null; likes: number | null; comments: number | null };
export async function socialPosts(a: SocialAccount, limit = 12): Promise<IgPost[]> {
  if (isDemoId(a.ig_user_id)) return demoPosts().slice(0, limit);
  if (!igLive() || !a.access_token) return [];
  return cached(`posts:${a.id}:${limit}`, 10 * 60_000, async () => {
    const j = await gget(`/me/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count&limit=${limit}`, a.access_token!);
    const data = (j?.data as Record<string, unknown>[] | undefined) ?? [];
    return data.map((m) => ({
      id: String(m.id), caption: (m.caption as string) ?? null, type: String(m.media_type ?? "IMAGE"),
      thumb: (m.thumbnail_url as string) ?? (m.media_type === "VIDEO" ? null : (m.media_url as string) ?? null),
      permalink: (m.permalink as string) ?? null, at: (m.timestamp as string) ?? null,
      likes: (m.like_count as number) ?? null, comments: (m.comments_count as number) ?? null,
    }));
  });
}

/* ── comments ── */
export type CommentFilter = "needs" | "auto" | "replied" | "all";
export type CommentRow = {
  id: string; comment_id: string; from_id: string | null; from_name: string | null; media_id: string | null; text: string | null;
  created_at: string; dm_status: string | null; public_status: string | null; handled_at: string | null;
  reply_text: string | null; reply_kind: string | null; replied_at: string | null; hidden_at: string | null;
  rule_name: string | null; rule_reply: string | null; rule_public: string | null; owner_reply_text: string | null; owner_replied_at: string | null; source: string;
  state: "needs" | "auto" | "replied" | "dismissed" | "old";
};

const STATE = `CASE WHEN c.replied_at IS NOT NULL OR c.owner_replied_at IS NOT NULL THEN 'replied'
                    WHEN c.dm_status = 'sent' OR c.public_status = 'sent' THEN 'auto'
                    WHEN c.hidden_at IS NOT NULL THEN 'dismissed'
                    WHEN c.created_at < now() - interval '7 days' THEN 'old' ELSE 'needs' END`;
const BASE = `FROM ig_comments c JOIN ig_accounts a ON a.id = c.ig_account_id
              LEFT JOIN keyword_rules r ON r.id = c.rule_id
             WHERE a.workspace_id = $1 AND a.live AND (c.from_id IS NULL OR c.from_id <> a.ig_user_id)`;
const COLS = `c.id, c.comment_id, c.from_id, c.from_name, c.media_id, c.text, c.created_at, c.dm_status, c.public_status, c.handled_at,
              c.reply_text, c.reply_kind, c.replied_at, c.hidden_at, c.owner_reply_text, c.owner_replied_at, c.source, r.name AS rule_name, r.reply AS rule_reply, r.comment_public_reply AS rule_public,
              ${STATE} AS state`;

export async function commentCounts(wsId: string): Promise<Record<CommentFilter, number>> {
  const { rows } = await getPool().query(`SELECT ${STATE} AS state, count(*)::int AS n ${BASE} GROUP BY 1`, [wsId]);
  const m = Object.fromEntries(rows.map((r) => [r.state, r.n])) as Record<string, number>;
  return { needs: m.needs ?? 0, auto: m.auto ?? 0, replied: m.replied ?? 0, all: (m.needs ?? 0) + (m.auto ?? 0) + (m.replied ?? 0) + (m.dismissed ?? 0) + (m.old ?? 0) };
}

export async function listComments(wsId: string, opts: { filter?: CommentFilter; media?: string | null; limit?: number } = {}): Promise<CommentRow[]> {
  const f = opts.filter ?? "all";
  const params: unknown[] = [wsId];
  let where = "";
  if (f !== "all") { params.push(f); where += ` AND ${STATE} = $${params.length}`; }
  if (opts.media) { params.push(opts.media); where += ` AND c.media_id = $${params.length}`; }
  params.push(Math.min(opts.limit ?? 200, 500));
  const { rows } = await getPool().query(`SELECT ${COLS} ${BASE}${where} ORDER BY c.created_at DESC LIMIT $${params.length}`, params);
  return rows as CommentRow[];
}

export async function commentDetail(wsId: string, id: string) {
  const p = getPool();
  const c = (await p.query(`SELECT ${COLS}, a.id AS account_id ${BASE} AND c.id = $2`, [wsId, id])).rows[0] as (CommentRow & { account_id: string }) | undefined;
  if (!c) return null;
  const onPost = c.media_id
    ? ((await p.query(`SELECT ${COLS} ${BASE} AND c.media_id = $2 ORDER BY c.created_at ASC LIMIT 100`, [wsId, c.media_id])).rows as CommentRow[])
    : [c];
  const byPerson = c.from_id
    ? (await p.query(`SELECT count(*)::int AS n, min(c.created_at) AS first ${BASE} AND c.from_id = $2`, [wsId, c.from_id])).rows[0]
    : { n: 1, first: c.created_at };
  const thread = c.from_id
    ? (await p.query(`SELECT id, last_inbound_at FROM ig_threads WHERE workspace_id = $1 AND igsid = $2 LIMIT 1`, [wsId, c.from_id])).rows[0] ?? null
    : null;
  const media = c.media_id ? (await igMediaInfo(c.account_id, [c.media_id]))[c.media_id] ?? null : null;
  return { comment: c, onPost, person: { comments: byPerson.n as number, since: byPerson.first as string }, thread, media };
}

export async function mediaFor(wsId: string, rows: { media_id: string | null }[]): Promise<Record<string, IgMedia>> {
  const ids = rows.map((r) => r.media_id).filter((x): x is string => !!x);
  if (!ids.length) return {};
  const a = (await getPool().query(`SELECT id FROM ig_accounts WHERE workspace_id = $1 AND live ORDER BY updated_at DESC LIMIT 1`, [wsId])).rows[0];
  return a ? igMediaInfo(a.id, ids) : {};
}

/* ── overview stats ── */
export async function socialStats(wsId: string) {
  const p = getPool();
  const one = async <T>(sql: string) => ((await p.query(sql, [wsId])).rows[0] ?? {}) as T;
  const [dm, cm, auto, daily, rules, settings] = await Promise.all([
    one<{ cur: number; prev: number; people: number }>(`SELECT
        (SELECT count(*)::int FROM ig_messages WHERE workspace_id = $1 AND direction = 'in' AND created_at > now() - interval '7 days') AS cur,
        (SELECT count(*)::int FROM ig_messages WHERE workspace_id = $1 AND direction = 'in' AND created_at BETWEEN now() - interval '14 days' AND now() - interval '7 days') AS prev,
        (SELECT count(DISTINCT thread_id)::int FROM ig_messages WHERE workspace_id = $1 AND direction = 'in' AND created_at > now() - interval '7 days') AS people`),
    one<{ cur: number; prev: number }>(`SELECT
        (SELECT count(*)::int ${BASE} AND c.created_at > now() - interval '7 days') AS cur,
        (SELECT count(*)::int ${BASE} AND c.created_at BETWEEN now() - interval '14 days' AND now() - interval '7 days') AS prev`),
    one<{ dms: number; comments: number }>(`SELECT
        (SELECT count(*)::int FROM ig_messages WHERE workspace_id = $1 AND origin = 'automation' AND status = 'sent' AND created_at > now() - interval '7 days') AS dms,
        (SELECT count(*)::int ${BASE} AND (c.dm_status = 'sent' OR c.public_status = 'sent') AND c.created_at > now() - interval '7 days') AS comments`),
    p.query(`SELECT d::date AS d,
        (SELECT count(*)::int FROM ig_messages m WHERE m.workspace_id = $1 AND m.direction = 'in' AND m.created_at::date = d::date) AS dms,
        (SELECT count(*)::int FROM ig_comments c JOIN ig_accounts a ON a.id = c.ig_account_id WHERE a.workspace_id = $1 AND c.created_at::date = d::date
           AND (c.from_id IS NULL OR c.from_id <> a.ig_user_id)) AS comments
       FROM generate_series(current_date - 13, current_date, interval '1 day') d ORDER BY d`, [wsId]).then((r) => r.rows as { d: Date; dms: number; comments: number }[]),
    one<{ dm: number; comment: number }>(`SELECT count(*) FILTER (WHERE on_instagram_dm)::int AS dm, count(*) FILTER (WHERE on_instagram_comment)::int AS comment
        FROM keyword_rules WHERE workspace_id = $1 AND enabled`),
    one<{ welcome_enabled: boolean; away_enabled: boolean }>(`SELECT welcome_enabled, away_enabled FROM automation_settings WHERE workspace_id = $1`),
  ]);
  return { dm, cm, auto, daily, rules, settings };
}

export async function recentDmThreads(wsId: string, limit = 5) {
  const { rows } = await getPool().query(
    `SELECT t.id, t.username, t.name, lm.body, lm.direction, lm.created_at,
            (SELECT count(*)::int FROM ig_messages m WHERE m.thread_id = t.id AND m.direction = 'in' AND m.created_at > COALESCE(t.last_read_at, to_timestamp(0))) AS unread
       FROM ig_threads t JOIN LATERAL (SELECT body, direction, created_at FROM ig_messages m WHERE m.thread_id = t.id ORDER BY created_at DESC LIMIT 1) lm ON true
      WHERE t.workspace_id = $1 ORDER BY lm.created_at DESC LIMIT $2`, [wsId, limit]);
  return rows as { id: string; username: string | null; name: string | null; body: string | null; direction: string; created_at: string; unread: number }[];
}
