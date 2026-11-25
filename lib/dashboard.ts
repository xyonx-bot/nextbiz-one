/**
 * Dashboard data — every channel the workspace has (WhatsApp, Instagram, Meta ads), one round trip.
 * The page composes itself from what's connected; nothing here invents numbers (no demo data on the dashboard).
 */
import { getPool } from "./db";
import { adsConnection, liveCampaigns } from "./meta-ads";
import { commentCounts } from "./social";

const DAY = 864e5;
// the dashboard refreshes itself every 30s — don't ask Meta for ad numbers that often
const adsCache = new Map<string, { at: number; v: Awaited<ReturnType<typeof liveCampaigns>> }>();
async function cachedCampaigns(conn: NonNullable<Awaited<ReturnType<typeof adsConnection>>>) {
  const key = `${conn.id}:${conn.ad_account_id}`, c = adsCache.get(key);
  if (c && Date.now() - c.at < 2 * 60_000) return c.v;
  const v = await liveCampaigns(conn, 7);
  if (v.ok) adsCache.set(key, { at: Date.now(), v });
  return v;
}
export type Dash = Awaited<ReturnType<typeof dashboardData>>;

export async function dashboardData(wsId: string) {
  const p = getPool();
  const q = <T = Record<string, unknown>>(sql: string, args: unknown[] = [wsId]) => p.query(sql, args).then((r) => r.rows as T[]).catch(() => [] as T[]);
  const one = async <T = Record<string, unknown>>(sql: string) => ((await q<T>(sql))[0] ?? {}) as T;

  const [daily, convs, contacts, reply, autoWa, autoIg, unread, closing, rejected, approved, recentWa, recentIg, lastBc, autoSet, wa, ig, igStats, rules] = await Promise.all([
    // customer messages per day, per channel (14 days)
    q<{ d: string; ch: string; dir: string; n: number }>(`
      SELECT to_char(created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS d, 'wa' AS ch, direction AS dir, count(*)::int AS n FROM messages WHERE workspace_id=$1 AND created_at > now() - interval '14 days' GROUP BY 1,3
      UNION ALL
      SELECT to_char(created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD'), 'ig', direction, count(*)::int FROM ig_messages WHERE ig_account_id IN (SELECT id FROM ig_accounts WHERE workspace_id=$1 AND live) AND created_at > now() - interval '14 days' GROUP BY 1,3`),
    one<{ cur: number; prev: number }>(`SELECT
        (SELECT count(DISTINCT conversation_id) FROM messages WHERE workspace_id=$1 AND direction='in' AND created_at > now() - interval '14 days')
        + (SELECT count(DISTINCT thread_id) FROM ig_messages WHERE ig_account_id IN (SELECT id FROM ig_accounts WHERE workspace_id=$1 AND live) AND direction='in' AND created_at > now() - interval '14 days') AS cur,
        (SELECT count(DISTINCT conversation_id) FROM messages WHERE workspace_id=$1 AND direction='in' AND created_at BETWEEN now() - interval '28 days' AND now() - interval '14 days')
        + (SELECT count(DISTINCT thread_id) FROM ig_messages WHERE ig_account_id IN (SELECT id FROM ig_accounts WHERE workspace_id=$1 AND live) AND direction='in' AND created_at BETWEEN now() - interval '28 days' AND now() - interval '14 days') AS prev`),
    one<{ total: number; opted: number; cur: number; prev: number; ig_new: number }>(`SELECT count(*)::int AS total, count(*) FILTER (WHERE opt_in)::int AS opted,
        count(*) FILTER (WHERE created_at > now() - interval '30 days')::int AS cur,
        count(*) FILTER (WHERE created_at BETWEEN now() - interval '60 days' AND now() - interval '30 days')::int AS prev,
        (SELECT count(*)::int FROM ig_threads WHERE ig_account_id IN (SELECT id FROM ig_accounts WHERE workspace_id=$1 AND live) AND created_at > now() - interval '30 days') AS ig_new
       FROM contacts WHERE workspace_id=$1`),
    // median time from a customer's message to the business's next reply (human or automatic), 14 days
    one<{ median_s: number | null; samples: number }>(`
      WITH pairs AS (
        SELECT EXTRACT(EPOCH FROM (o.created_at - m.created_at)) AS s FROM messages m
          JOIN LATERAL (SELECT created_at FROM messages x WHERE x.conversation_id=m.conversation_id AND x.direction='out' AND x.created_at > m.created_at ORDER BY created_at LIMIT 1) o ON true
         WHERE m.workspace_id=$1 AND m.direction='in' AND m.created_at > now() - interval '14 days'
        UNION ALL
        SELECT EXTRACT(EPOCH FROM (o.created_at - m.created_at)) FROM ig_messages m
          JOIN LATERAL (SELECT created_at FROM ig_messages x WHERE x.thread_id=m.thread_id AND x.direction='out' AND x.created_at > m.created_at ORDER BY created_at LIMIT 1) o ON true
         WHERE m.ig_account_id IN (SELECT id FROM ig_accounts WHERE workspace_id=$1 AND live) AND m.direction='in' AND m.created_at > now() - interval '14 days')
      SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY s)::float AS median_s, count(*)::int AS samples FROM pairs`),
    q<{ type: string; n: number }>(`SELECT type, count(*)::int AS n FROM automation_log WHERE workspace_id=$1 AND status='sent' AND created_at > now() - interval '7 days' AND COALESCE(detail,'') NOT LIKE '[instagram]%' GROUP BY 1`),
    one<{ n: number }>(`SELECT count(*)::int AS n FROM ig_messages WHERE ig_account_id IN (SELECT id FROM ig_accounts WHERE workspace_id=$1 AND live) AND origin='automation' AND status='sent' AND created_at > now() - interval '7 days'`),
    one<{ wa: number; ig: number; oldest: string | null }>(`SELECT
        (SELECT count(*)::int FROM conversations c WHERE c.workspace_id=$1 AND EXISTS (SELECT 1 FROM waba_connections w WHERE w.workspace_id=$1 AND w.status='connected') AND EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id=c.id AND m.direction='in' AND m.created_at > COALESCE(c.last_read_at, to_timestamp(0)))) AS wa,
        (SELECT count(*)::int FROM ig_threads t WHERE t.ig_account_id IN (SELECT id FROM ig_accounts WHERE workspace_id=$1 AND live) AND EXISTS (SELECT 1 FROM ig_messages m WHERE m.thread_id=t.id AND m.direction='in' AND m.created_at > COALESCE(t.last_read_at, to_timestamp(0)))) AS ig,
        LEAST((SELECT min(m.created_at) FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE c.workspace_id=$1 AND EXISTS (SELECT 1 FROM waba_connections w WHERE w.workspace_id=$1 AND w.status='connected') AND m.direction='in' AND m.created_at > COALESCE(c.last_read_at, to_timestamp(0))),
              (SELECT min(m.created_at) FROM ig_messages m JOIN ig_threads t ON t.id=m.thread_id WHERE t.ig_account_id IN (SELECT id FROM ig_accounts WHERE workspace_id=$1 AND live) AND m.direction='in' AND m.created_at > COALESCE(t.last_read_at, to_timestamp(0))))::text AS oldest`),
    one<{ n: number }>(`SELECT
        (SELECT count(*) FROM conversations c WHERE c.workspace_id=$1 AND EXISTS (SELECT 1 FROM waba_connections w WHERE w.workspace_id=$1 AND w.status='connected') AND c.last_inbound_at BETWEEN now() - interval '24 hours' AND now() - interval '21 hours'
           AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id=c.id AND m.direction='out' AND m.created_at > c.last_inbound_at))
        + (SELECT count(*) FROM ig_threads t WHERE t.ig_account_id IN (SELECT id FROM ig_accounts WHERE workspace_id=$1 AND live) AND t.last_inbound_at BETWEEN now() - interval '24 hours' AND now() - interval '21 hours'
           AND NOT EXISTS (SELECT 1 FROM ig_messages m WHERE m.thread_id=t.id AND m.direction='out' AND m.created_at > t.last_inbound_at)) AS n`),
    q<{ name: string }>(`SELECT name FROM templates WHERE workspace_id=$1 AND lower(status)='rejected' ORDER BY updated_at DESC`),
    one<{ n: number }>(`SELECT count(*)::int AS n FROM templates WHERE workspace_id=$1 AND lower(status)='approved'`),
    q<{ id: string; name: string | null; handle: string; body: string | null; at: string; dir: string; unread: number }>(`
      SELECT c.id, ct.name, ct.wa_id AS handle, lm.body, lm.created_at AS at, lm.direction AS dir,
             (SELECT count(*)::int FROM messages m WHERE m.conversation_id=c.id AND m.direction='in' AND m.created_at > COALESCE(c.last_read_at, to_timestamp(0))) AS unread
        FROM conversations c JOIN contacts ct ON ct.id=c.contact_id
        JOIN LATERAL (SELECT body, created_at, direction FROM messages m WHERE m.conversation_id=c.id ORDER BY created_at DESC LIMIT 1) lm ON true
       WHERE c.workspace_id=$1 AND EXISTS (SELECT 1 FROM waba_connections w WHERE w.workspace_id=$1 AND w.status='connected') ORDER BY lm.created_at DESC LIMIT 6`),
    q<{ id: string; name: string | null; handle: string | null; body: string | null; at: string; dir: string; unread: number }>(`
      SELECT t.id, t.name, t.username AS handle, lm.body, lm.created_at AS at, lm.direction AS dir,
             (SELECT count(*)::int FROM ig_messages m WHERE m.thread_id=t.id AND m.direction='in' AND m.created_at > COALESCE(t.last_read_at, to_timestamp(0))) AS unread
        FROM ig_threads t JOIN LATERAL (SELECT body, created_at, direction FROM ig_messages m WHERE m.thread_id=t.id ORDER BY created_at DESC LIMIT 1) lm ON true
       WHERE t.ig_account_id IN (SELECT id FROM ig_accounts WHERE workspace_id=$1 AND live) ORDER BY lm.created_at DESC LIMIT 6`),
    q<{ id: string; name: string; sent_at: string; total: number; sent: number; delivered: number; read: number; failed: number; replied: number }>(`
      SELECT b.id, b.name, b.sent_at, count(br.id)::int AS total,
             count(*) FILTER (WHERE br.status IN ('sent','delivered','read'))::int AS sent,
             count(*) FILTER (WHERE br.status IN ('delivered','read'))::int AS delivered,
             count(*) FILTER (WHERE br.status = 'read')::int AS read,
             count(*) FILTER (WHERE br.status = 'failed')::int AS failed,
             (SELECT count(DISTINCT c.contact_id)::int FROM messages m JOIN conversations c ON c.id = m.conversation_id
               WHERE m.direction = 'in' AND m.created_at > b.sent_at AND c.contact_id IN (SELECT contact_id FROM broadcast_recipients WHERE broadcast_id = b.id)) AS replied
        FROM broadcasts b LEFT JOIN broadcast_recipients br ON br.broadcast_id = b.id
       WHERE b.workspace_id=$1 AND b.sent_at IS NOT NULL GROUP BY b.id ORDER BY b.sent_at DESC LIMIT 1`),
    one<{ welcome_enabled: boolean; away_enabled: boolean; ig_welcome_enabled: boolean; ig_away_enabled: boolean }>(`SELECT welcome_enabled, away_enabled, ig_welcome_enabled, ig_away_enabled FROM automation_settings WHERE workspace_id=$1`),
    one<{ status: string | null; display_name: string | null; last_in: string | null }>(`SELECT
        (SELECT status FROM waba_connections WHERE workspace_id=$1 ORDER BY (status='connected') DESC, created_at DESC LIMIT 1) AS status,
        (SELECT display_name FROM waba_connections WHERE workspace_id=$1 ORDER BY (status='connected') DESC, created_at DESC LIMIT 1) AS display_name,
        (SELECT max(created_at)::text FROM messages WHERE workspace_id=$1 AND direction='in') AS last_in`),
    one<{ username: string | null; last_error: string | null; last_in: string | null; webhook_subscribed: boolean | null }>(`SELECT a.username, a.last_error, a.webhook_subscribed,
        (SELECT max(created_at)::text FROM ig_messages WHERE ig_account_id IN (SELECT id FROM ig_accounts WHERE workspace_id=$1 AND live) AND direction='in') AS last_in
       FROM ig_accounts a WHERE a.workspace_id=$1 AND a.live ORDER BY a.updated_at DESC LIMIT 1`),
    one<{ dms: number; comments: number }>(`SELECT
        (SELECT count(*)::int FROM ig_messages WHERE ig_account_id IN (SELECT id FROM ig_accounts WHERE workspace_id=$1 AND live) AND direction='in' AND created_at > now() - interval '7 days') AS dms,
        (SELECT count(*)::int FROM ig_comments c JOIN ig_accounts a ON a.id=c.ig_account_id WHERE a.workspace_id=$1 AND a.live AND c.created_at > now() - interval '7 days' AND (c.from_id IS NULL OR c.from_id <> a.ig_user_id)) AS comments`),
    one<{ n: number }>(`SELECT count(*)::int AS n FROM keyword_rules WHERE workspace_id=$1 AND enabled`),
  ]);

  // 14 calendar days, India time
  const days: string[] = [];
  for (let i = 13; i >= 0; i--) days.push(new Date(Date.now() - i * DAY).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }));
  const series = (ch: string, dir: string) => days.map((d) => daily.find((r) => r.d === d && r.ch === ch && r.dir === dir)?.n ?? 0);
  const waIn = series("wa", "in"), waOut = series("wa", "out"), igIn = series("ig", "in"), igOut = series("ig", "out");
  const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);

  const igOn = !!ig.username;
  const comments = igOn ? await commentCounts(wsId).catch(() => null) : null;

  // ads: live numbers only when an ad account is connected (no demo data on the dashboard)
  let ads: null | { name: string | null; spend: number; results: number; cpr: number; active: number; error: string | null } = null;
  const conn = await adsConnection(wsId).catch(() => null);
  if (conn) {
    const live = await Promise.race([cachedCampaigns(conn), new Promise<{ ok: false; error: string }>((r) => setTimeout(() => r({ ok: false, error: "Meta is slow to answer" }), 6000))]);
    if (live.ok) {
      const t = live.campaigns.reduce((a, c) => ({ spend: a.spend + c.insights.spend, results: a.results + c.insights.results }), { spend: 0, results: 0 });
      ads = { name: conn.name, spend: t.spend, results: t.results, cpr: t.results ? t.spend / t.results : 0, active: live.campaigns.filter((c) => c.status === "ACTIVE").length, error: null };
    } else ads = { name: conn.name, spend: 0, results: 0, cpr: 0, active: 0, error: live.error };
  }

  const recent = [
    ...recentWa.map((r) => ({ ...r, ch: "wa" as const, href: `/inbox?open=${r.id}`, who: r.name ?? `+${r.handle}` })),
    ...recentIg.map((r) => ({ ...r, ch: "ig" as const, href: `/social/dms?open=ig:${r.id}`, who: r.handle ? `@${r.handle}` : r.name ?? "Instagram user" })),
  ].sort((a, b) => +new Date(b.at) - +new Date(a.at)).slice(0, 6);

  return {
    days, waIn, waOut, igIn, igOut,
    totals: { in14: sum(waIn) + sum(igIn), out14: sum(waOut) + sum(igOut), waIn: sum(waIn), igIn: sum(igIn) },
    everActive: !!wa.last_in || !!ig.last_in,
    convs, contacts, reply,
    auto: { wa: Object.fromEntries(autoWa.map((r) => [r.type, r.n])) as Record<string, number>, ig: autoIg.n ?? 0, total: autoWa.reduce((s, r) => s + r.n, 0) + (autoIg.n ?? 0) },
    unread, closing: closing.n ?? 0, rejected: rejected.map((r) => r.name), approvedTemplates: approved.n ?? 0,
    recent, lastBc: lastBc[0] ?? null, settings: autoSet, rulesOn: rules.n ?? 0,
    wa: { connected: wa.status === "connected", displayName: wa.display_name, lastIn: wa.last_in },
    ig: igOn ? { username: ig.username, lastError: ig.last_error, lastIn: ig.last_in, subscribed: !!ig.webhook_subscribed, dms7: igStats.dms ?? 0, comments7: igStats.comments ?? 0, needs: comments?.needs ?? 0 } : null,
    ads,
  };
}
