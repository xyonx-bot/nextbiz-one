/**
 * NextBiz Ads — live Meta Marketing API client (replaces the demo internals of lib/ads.ts when a workspace
 * has connected an ad account). Reading is free; spend is billed by Meta to the ad account, never by us.
 *
 * Safety: nothing here creates spend on its own. Status changes are explicit user actions; resuming a
 * campaign is confirmed in the UI. Tokens: per-workspace (encrypted), or the server's system-user token for
 * the platform owner's own workspace only.
 */
import { getPool } from "./db";
import { decrypt, encrypt } from "./crypto";
import type { AdsCampaign, AdsObjective, PerformanceReport } from "./ads";

const G = "https://graph.facebook.com/v21.0";

export type AdsConnection = {
  id: string; workspace_id: string; ad_account_id: string; name: string | null; currency: string | null; timezone: string | null;
  uses_system_token: boolean; token_enc: Buffer | null; token_expires_at: string | null; last_error: string | null; updated_at: string;
};
export type AdAccountInfo = { id: string; name: string; currency: string; timezone: string | null; status: number; spent: number; balanceLabel: string | null; business: string | null };

export async function adsConnection(wsId: string): Promise<AdsConnection | null> {
  const { rows } = await getPool().query(`SELECT * FROM ads_connections WHERE workspace_id = $1`, [wsId]);
  return (rows[0] as AdsConnection) ?? null;
}
const systemToken = () => process.env.META_ACCESS_TOKEN || null;
export function tokenOf(c: AdsConnection): string | null {
  return c.uses_system_token ? systemToken() : decrypt(c.token_enc);
}

async function gget<T>(path: string, token: string): Promise<{ ok: true; data: T } | { ok: false; error: string; code?: number }> {
  try {
    const r = await fetch(`${G}${path}${path.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(12000) });
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (!r.ok || j.error) { const e = (j.error ?? {}) as { message?: string; error_user_msg?: string; code?: number }; return { ok: false, error: e.error_user_msg ?? e.message ?? `Meta error ${r.status}`, code: e.code }; }
    return { ok: true, data: j as T };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}
async function gpost(path: string, token: string, body: Record<string, string>) {
  const r = await fetch(`${G}${path}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ ...body, access_token: token }), signal: AbortSignal.timeout(12000) });
  const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok || j.error) { const e = (j.error ?? {}) as { message?: string; error_user_msg?: string }; return { ok: false as const, error: e.error_user_msg ?? e.message ?? `Meta error ${r.status}` }; }
  return { ok: true as const, data: j };
}

/* ── connecting ── */

type RawAccount = { id: string; account_id: string; name: string; currency: string; timezone_name?: string; account_status: number; amount_spent?: string;
  funding_source_details?: { display_string?: string }; business?: { name?: string } };
const ACCT_FIELDS = "name,account_id,currency,timezone_name,account_status,amount_spent,funding_source_details,business";
const toInfo = (a: RawAccount): AdAccountInfo => ({ id: a.id, name: a.name, currency: a.currency, timezone: a.timezone_name ?? null, status: a.account_status,
  spent: Number(a.amount_spent ?? 0) / 100, balanceLabel: a.funding_source_details?.display_string ?? null, business: a.business?.name ?? null });

export async function listAdAccounts(token: string): Promise<{ ok: true; accounts: AdAccountInfo[] } | { ok: false; error: string }> {
  const r = await gget<{ data: RawAccount[] }>(`/me/adaccounts?fields=${ACCT_FIELDS}&limit=50`, token);
  return r.ok ? { ok: true, accounts: r.data.data.map(toInfo) } : r;
}
export const systemAdAccounts = async () => { const t = systemToken(); return t ? listAdAccounts(t) : { ok: false as const, error: "No system access configured" }; };

/** Short-lived Facebook user token → long-lived (≈60 days). */
export async function longLivedUserToken(short: string): Promise<{ ok: true; token: string; expiresAt: string | null } | { ok: false; error: string }> {
  const id = process.env.META_APP_ID, secret = process.env.META_APP_SECRET;
  if (!id || !secret) return { ok: false, error: "Meta app secret isn't configured on this server" };
  const r = await gget<{ access_token: string; expires_in?: number }>(`/oauth/access_token?grant_type=fb_exchange_token&client_id=${id}&client_secret=${encodeURIComponent(secret)}&fb_exchange_token=${encodeURIComponent(short)}`, short);
  if (!r.ok) return r;
  return { ok: true, token: r.data.access_token, expiresAt: r.data.expires_in ? new Date(Date.now() + r.data.expires_in * 1000).toISOString() : null };
}

export async function saveConnection(wsId: string, info: AdAccountInfo, how: { system: true } | { token: string; expiresAt: string | null }, by: string) {
  await getPool().query(
    `INSERT INTO ads_connections (workspace_id, ad_account_id, name, currency, timezone, token_enc, uses_system_token, token_expires_at, connected_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (workspace_id) DO UPDATE SET ad_account_id = EXCLUDED.ad_account_id, name = EXCLUDED.name, currency = EXCLUDED.currency,
       timezone = EXCLUDED.timezone, token_enc = EXCLUDED.token_enc, uses_system_token = EXCLUDED.uses_system_token,
       token_expires_at = EXCLUDED.token_expires_at, connected_by = EXCLUDED.connected_by, last_error = NULL, updated_at = now()`,
    [wsId, info.id, info.name, info.currency, info.timezone, "system" in how ? null : encrypt(how.token), "system" in how, "system" in how ? null : how.expiresAt, by]);
}
export async function removeConnection(wsId: string) { await getPool().query(`DELETE FROM ads_connections WHERE workspace_id = $1`, [wsId]); }

export async function accountInfo(c: AdsConnection): Promise<AdAccountInfo | null> {
  const t = tokenOf(c); if (!t) return null;
  const r = await gget<RawAccount>(`/${c.ad_account_id}?fields=${ACCT_FIELDS}`, t);
  return r.ok ? toInfo(r.data) : null;
}

/* ── reading campaigns + insights ── */

type Action = { action_type: string; value: string };
type Ins = { spend?: string; impressions?: string; reach?: string; clicks?: string; actions?: Action[]; date_start?: string };
type RawCampaign = { id: string; name: string; objective?: string; status?: string; effective_status?: string; daily_budget?: string; lifetime_budget?: string;
  start_time?: string; stop_time?: string; insights?: { data?: Ins[] } };

const OBJ: Record<string, AdsObjective> = {
  OUTCOME_ENGAGEMENT: "OUTCOME_ENGAGEMENT", MESSAGES: "OUTCOME_ENGAGEMENT", POST_ENGAGEMENT: "OUTCOME_ENGAGEMENT", PAGE_LIKES: "OUTCOME_ENGAGEMENT",
  OUTCOME_TRAFFIC: "OUTCOME_TRAFFIC", LINK_CLICKS: "OUTCOME_TRAFFIC", OUTCOME_LEADS: "OUTCOME_LEADS", LEAD_GENERATION: "OUTCOME_LEADS",
  OUTCOME_SALES: "OUTCOME_SALES", CONVERSIONS: "OUTCOME_SALES", PRODUCT_CATALOG_SALES: "OUTCOME_SALES",
  OUTCOME_AWARENESS: "OUTCOME_AWARENESS", REACH: "OUTCOME_AWARENESS", BRAND_AWARENESS: "OUTCOME_AWARENESS", VIDEO_VIEWS: "OUTCOME_AWARENESS",
};
function statusOf(c: RawCampaign): AdsCampaign["status"] {
  const s = c.effective_status ?? c.status ?? "";
  if (s === "ACTIVE") return "ACTIVE";
  if (["PAUSED", "CAMPAIGN_PAUSED", "ADSET_PAUSED"].includes(s)) return "PAUSED";
  if (["IN_PROCESS", "PENDING_REVIEW", "PENDING_BILLING_INFO", "PREAPPROVED"].includes(s)) return "IN_REVIEW";
  if (["DELETED", "ARCHIVED", "DISAPPROVED"].includes(s)) return "CANCELLED";
  return "PAUSED";
}
/** "Results" the way Meta counts them for each goal. */
function resultsOf(objective: AdsObjective, actions: Action[] = []): number {
  const pick = (...types: string[]) => actions.filter((a) => types.includes(a.action_type)).reduce((s, a) => s + Number(a.value || 0), 0);
  switch (objective) {
    case "OUTCOME_ENGAGEMENT": return pick("onsite_conversion.messaging_conversation_started_7d") || pick("post_engagement");
    case "OUTCOME_TRAFFIC": return pick("link_click", "landing_page_view");
    case "OUTCOME_LEADS": return pick("lead", "onsite_conversion.lead_grouped", "onsite_conversion.messaging_conversation_started_7d");
    case "OUTCOME_SALES": return pick("purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase");
    default: return 0;
  }
}
const r2 = (n: number) => Math.round(n * 100) / 100;

export async function liveCampaigns(c: AdsConnection, days: 7 | 30 = 7): Promise<{ ok: true; campaigns: AdsCampaign[] } | { ok: false; error: string }> {
  const t = tokenOf(c); if (!t) return { ok: false, error: "The ad account login has expired — reconnect it in Connections." };
  const preset = days === 30 ? "last_30d" : "last_7d";
  const r = await gget<{ data: RawCampaign[] }>(`/${c.ad_account_id}/campaigns?fields=id,name,objective,status,effective_status,daily_budget,lifetime_budget,start_time,stop_time,insights.date_preset(${preset}){spend,impressions,reach,clicks,actions}&limit=100`, t);
  if (!r.ok) { await getPool().query(`UPDATE ads_connections SET last_error = $2 WHERE id = $1`, [c.id, r.error]); return r; }
  return {
    ok: true,
    campaigns: r.data.data.map((x) => {
      const objective = OBJ[x.objective ?? ""] ?? "OUTCOME_ENGAGEMENT";
      const i = x.insights?.data?.[0] ?? {};
      const spend = r2(Number(i.spend ?? 0)), results = resultsOf(objective, i.actions);
      return {
        id: x.id, name: x.name, objective, status: statusOf(x),
        daily_budget: Math.round(Number(x.daily_budget ?? 0) / 100), // Meta budgets are in the currency's minor unit
        start_time: x.start_time ?? null, stop_time: x.stop_time ?? null,
        destination: objective === "OUTCOME_ENGAGEMENT" ? "whatsapp" : objective === "OUTCOME_TRAFFIC" ? "website" : null,
        source: "live" as const,
        insights: { spend, impressions: Number(i.impressions ?? 0), reach: Number(i.reach ?? 0), clicks: Number(i.clicks ?? 0), results, cost_per_result: results ? r2(spend / results) : 0 },
      };
    }),
  };
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);
export async function livePerformance(c: AdsConnection, days: 7 | 30): Promise<{ ok: true; report: PerformanceReport } | { ok: false; error: string }> {
  const t = tokenOf(c); if (!t) return { ok: false, error: "The ad account login has expired — reconnect it in Connections." };
  const today = new Date(), start = new Date(today.getTime() - (days - 1) * 864e5), pEnd = new Date(start.getTime() - 864e5), pStart = new Date(pEnd.getTime() - (days - 1) * 864e5);
  const range = (a: Date, b: Date) => encodeURIComponent(JSON.stringify({ since: ymd(a), until: ymd(b) }));
  const F = "spend,impressions,reach,clicks,actions";
  const [daily, prev] = await Promise.all([
    gget<{ data: Ins[] }>(`/${c.ad_account_id}/insights?fields=${F}&time_increment=1&time_range=${range(start, today)}&limit=60`, t),
    gget<{ data: Ins[] }>(`/${c.ad_account_id}/insights?fields=${F}&time_range=${range(pStart, pEnd)}`, t),
  ]);
  if (!daily.ok) return daily;
  const conv = (a?: Action[]) => (a ?? []).filter((x) => ["onsite_conversion.messaging_conversation_started_7d", "lead", "link_click", "purchase"].includes(x.action_type)).reduce((s, x) => s + Number(x.value || 0), 0);
  const byDay = new Map(daily.data.data.map((d) => [d.date_start, d]));
  const series = Array.from({ length: days }, (_, k) => {
    const d = ymd(new Date(start.getTime() + k * 864e5)); const x = byDay.get(d) ?? {};
    return { date: d, spend: r2(Number(x.spend ?? 0)), clicks: Number(x.clicks ?? 0), results: conv(x.actions) };
  });
  const sum = (rows: Ins[]) => {
    const s = rows.reduce((a, x) => ({ spend: a.spend + Number(x.spend ?? 0), impressions: a.impressions + Number(x.impressions ?? 0), reach: a.reach + Number(x.reach ?? 0), clicks: a.clicks + Number(x.clicks ?? 0), results: a.results + conv(x.actions) }),
      { spend: 0, impressions: 0, reach: 0, clicks: 0, results: 0 });
    return { ...s, spend: r2(s.spend), cost_per_result: s.results ? r2(s.spend / s.results) : 0 };
  };
  return { ok: true, report: { range: `${days}d`, totals: sum(daily.data.data), prev_totals: sum(prev.ok ? prev.data.data : []), series, currency: "INR", demo: false } as unknown as PerformanceReport };
}

/** Pause / resume a live campaign. Only ACTIVE and PAUSED — nothing else can be set from here. */
export async function setLiveStatus(c: AdsConnection, campaignId: string, status: "ACTIVE" | "PAUSED") {
  const t = tokenOf(c); if (!t) return { ok: false as const, error: "The ad account login has expired — reconnect it in Connections." };
  // the campaign must belong to the connected account
  const own = await gget<{ account_id: string }>(`/${encodeURIComponent(campaignId)}?fields=account_id`, t);
  if (!own.ok || `act_${own.data.account_id}` !== c.ad_account_id) return { ok: false as const, error: "Campaign not found in this ad account." };
  return gpost(`/${encodeURIComponent(campaignId)}`, t, { status });
}
