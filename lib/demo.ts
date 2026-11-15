/**
 * Demo workspace (promo videos, screenshots, sales demos).
 *
 * A demo workspace looks fully connected — WhatsApp, Instagram and a Meta ad account — but every id starts
 * with "demo", so no request ever reaches Meta: sends succeed locally (with ✓ → ✓✓ → blue ticks a few
 * seconds later), templates are approved after a short wait, and Instagram posts and ad numbers come from
 * the fixtures below. Seeded by scripts/seed-demo.mjs. Real workspaces never have "demo" ids.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getPool } from "./db";
import type { AdsCampaign, PerformanceReport } from "./ads";

export const isDemoId = (id: string | null | undefined) => !!id && /^(act_)?demo[-_]/.test(id);
export const demoMsgId = (kind = "wa") => `demo-${kind}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** Sent → delivered → read, like a real phone on the other end. */
export function demoTicks(waMessageId: string) {
  const set = async (status: string) => {
    await getPool().query(`UPDATE messages SET status = $2 WHERE wa_message_id = $1 AND status <> 'read'`, [waMessageId, status]).catch(() => {});
    await getPool().query(`UPDATE broadcast_recipients SET status = $2 WHERE wa_message_id = $1 AND status <> 'read'`, [waMessageId, status]).catch(() => {});
  };
  setTimeout(() => void set("delivered"), 2500);
  setTimeout(() => void set("read"), 7000);
}

/* ── Instagram ── */

export const DEMO_PROFILE = { followers: 18420, follows: 312, posts: 247 };
const POSTS: [string, string, number, number, number][] = [
  // [file, caption, likes, comments, hours ago]
  ["post-1", "New drop: the Monsoon Collection 🌧️ Petrichor, wet jasmine and cedar — three scents for slow rainy evenings. Comment PRICE and we'll DM you the details.", 1284, 86, 20],
  ["post-2", "Hand-poured in small batches, every single one. 100% soy wax, cotton wicks, zero shortcuts.", 942, 41, 70],
  ["post-3", "Gift sets are back 🎁 Three minis + a matchbox, wrapped and ready. Order on WhatsApp — link in bio.", 1610, 133, 140],
  ["post-4", "Behind the scenes: 6 am at the studio, wax melting, coffee brewing ☕", 708, 22, 220],
  ["post-5", "Your desk deserves a good smell too. Meet Sandalwood & Sea Salt.", 1153, 57, 310],
  ["post-6", "Weekend sale: 20% off everything with code MELLOW20 ✨", 2034, 164, 420],
];
// post pictures are optional: drop public/art/demo/post-1.jpg … post-6.jpg in and they show up
const pic = (f: string) => existsSync(join(process.cwd(), "public/art/demo", `${f}.jpg`)) ? `/art/demo/${f}.jpg` : null;
export function demoPosts() {
  return POSTS.map(([f, caption, likes, comments, h]) => ({
    id: `demo-media-${f}`, caption, type: "IMAGE", thumb: pic(f), permalink: null,
    at: new Date(Date.now() - h * 3600e3).toISOString(), likes, comments,
  }));
}
export function demoMedia(ids: string[]) {
  const all = Object.fromEntries(demoPosts().map((p) => [p.id, { id: p.id, permalink: null, thumb: p.thumb, caption: p.caption, type: "IMAGE" }]));
  return Object.fromEntries(ids.filter((id) => all[id]).map((id) => [id, all[id]]));
}

/* ── Meta Ads ── */
// campaign ids look like Meta's (numeric) so the normal live-campaign routes handle them; 1202999… is the demo range
export const demoCampaignId = () => `1202999${Date.now().toString().slice(-8)}`;

type DemoCampaign = { id: string; name: string; status: AdsCampaign["status"]; objective: AdsCampaign["objective"]; budget: number; startDays: number; cpr: number; ctr: number };
const CAMPAIGNS: DemoCampaign[] = [
  { id: "120299900000001", name: "Monsoon Collection — chat on WhatsApp", status: "ACTIVE", objective: "OUTCOME_ENGAGEMENT", budget: 800, startDays: 12, cpr: 18.4, ctr: 0.031 },
  { id: "120299900000002", name: "Gift sets — Instagram DMs", status: "ACTIVE", objective: "OUTCOME_ENGAGEMENT", budget: 500, startDays: 20, cpr: 22.1, ctr: 0.027 },
  { id: "120299900000003", name: "Weekend sale — website visits", status: "PAUSED", objective: "OUTCOME_TRAFFIC", budget: 400, startDays: 34, cpr: 3.9, ctr: 0.019 },
  { id: "120299900000004", name: "Bengaluru studio — reach", status: "PAUSED", objective: "OUTCOME_AWARENESS", budget: 300, startDays: 45, cpr: 0, ctr: 0.012 },
];
const statusOverride = new Map<string, "ACTIVE" | "PAUSED">();
export function demoSetStatus(id: string, status: "ACTIVE" | "PAUSED") { statusOverride.set(id, status); return { ok: true as const, data: { success: true } }; }

// smooth, slightly rising daily curve so charts look like a real account
const wave = (k: number, seed: number) => 0.82 + 0.16 * Math.sin(k * 0.9 + seed) + 0.1 * Math.sin(k * 2.3 + seed * 2) + k * 0.012;
function campaignDay(c: DemoCampaign, daysAgo: number) {
  const started = daysAgo <= c.startDays;
  const running = c.status === "ACTIVE" || daysAgo > 6; // paused ones stopped about a week ago
  if (!started || !running) return { spend: 0, impressions: 0, reach: 0, clicks: 0, results: 0 };
  const spend = Math.round(c.budget * wave(30 - daysAgo, c.budget) * 100) / 100;
  const impressions = Math.round(spend * (c.objective === "OUTCOME_AWARENESS" ? 9.5 : 4.2));
  const clicks = Math.round(impressions * c.ctr);
  const results = c.cpr ? Math.round(spend / c.cpr) : 0;
  return { spend, impressions, reach: Math.round(impressions * 0.72), clicks, results };
}

export async function demoCampaigns(wsId: string, days: 7 | 30): Promise<AdsCampaign[]> {
  // campaigns "published" from the builder in the demo show up too (paused, no spend yet)
  const extra = (await getPool().query(
    `SELECT meta_campaign_id AS id, name, objective, daily_budget, start_time, stop_time, destination FROM ads_mock_campaigns
      WHERE workspace_id = $1 AND meta_campaign_id LIKE '1202999%' ORDER BY published_at DESC`, [wsId]).catch(() => ({ rows: [] }))).rows;
  const zero = { spend: 0, impressions: 0, reach: 0, clicks: 0, results: 0, cost_per_result: 0 };
  return [
    ...extra.map((x) => ({ id: x.id, name: x.name, objective: x.objective, status: statusOverride.get(x.id) ?? "PAUSED", daily_budget: x.daily_budget,
      start_time: x.start_time, stop_time: x.stop_time, destination: x.destination, source: "live" as const, insights: zero })),
    ...CAMPAIGNS.map((c) => {
      const t = Array.from({ length: days }, (_, d) => campaignDay(c, d)).reduce((a, x) => ({ spend: a.spend + x.spend, impressions: a.impressions + x.impressions, reach: a.reach + x.reach, clicks: a.clicks + x.clicks, results: a.results + x.results }), { spend: 0, impressions: 0, reach: 0, clicks: 0, results: 0 });
      return {
        id: c.id, name: c.name, objective: c.objective, status: statusOverride.get(c.id) ?? c.status, daily_budget: c.budget,
        start_time: new Date(Date.now() - c.startDays * 864e5).toISOString(), stop_time: null,
        destination: c.objective === "OUTCOME_ENGAGEMENT" ? "whatsapp" as const : c.objective === "OUTCOME_TRAFFIC" ? "website" as const : null,
        source: "live" as const,
        insights: { ...t, spend: Math.round(t.spend * 100) / 100, cost_per_result: t.results ? Math.round((t.spend / t.results) * 100) / 100 : 0 },
      };
    }),
  ];
}

export function demoPerformance(days: 7 | 30): PerformanceReport {
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  const day = (daysAgo: number) => CAMPAIGNS.map((c) => campaignDay(c, daysAgo)).reduce((a, x) => ({ spend: a.spend + x.spend, impressions: a.impressions + x.impressions, reach: a.reach + x.reach, clicks: a.clicks + x.clicks, results: a.results + x.results }), { spend: 0, impressions: 0, reach: 0, clicks: 0, results: 0 });
  const series = Array.from({ length: days }, (_, k) => { const ago = days - 1 - k, x = day(ago); return { date: ymd(new Date(Date.now() - ago * 864e5)), spend: Math.round(x.spend * 100) / 100, clicks: x.clicks, results: x.results }; });
  const cur = Array.from({ length: days }, (_, k) => day(k)).reduce((a, x) => ({ spend: a.spend + x.spend, impressions: a.impressions + x.impressions, reach: a.reach + x.reach, clicks: a.clicks + x.clicks, results: a.results + x.results }), { spend: 0, impressions: 0, reach: 0, clicks: 0, results: 0 });
  // the period before ran a little weaker, so the comparison shows healthy growth
  const shape = (x: typeof cur, k: number, kr: number) => {
    const r = { spend: Math.round(x.spend * k * 100) / 100, impressions: Math.round(x.impressions * k), reach: Math.round(x.reach * k), clicks: Math.round(x.clicks * k), results: Math.round(x.results * kr) };
    return { ...r, cost_per_result: r.results ? Math.round((r.spend / r.results) * 100) / 100 : 0 };
  };
  return { range: `${days}d`, totals: shape(cur, 1, 1), prev_totals: shape(cur, 0.84, 0.71), series, currency: "INR", demo: false } as unknown as PerformanceReport;
}

export const DEMO_ACCOUNT = { status: 1, spent: 48230.5, balanceLabel: "Visa •••• 4242", business: "Mellowmoon Candle Co." };
export const DEMO_IDENTITY = {
  pages: [{ id: "demo-page-1", name: "Mellowmoon Candle Co.", whatsapp: true }],
  instagram: [{ id: "demo-ig-acct", username: "mellowmoon.studio" }],
  pageError: null,
};
const CITIES: [string, string, string][] = [["Bengaluru", "Karnataka", "city"], ["Mumbai", "Maharashtra", "city"], ["Delhi", "Delhi", "city"], ["Pune", "Maharashtra", "city"], ["Hyderabad", "Telangana", "city"], ["Chennai", "Tamil Nadu", "city"], ["Kolkata", "West Bengal", "city"], ["Ahmedabad", "Gujarat", "city"], ["Jaipur", "Rajasthan", "city"], ["Kochi", "Kerala", "city"], ["Karnataka", "", "region"], ["Maharashtra", "", "region"], ["India", "", "country"]];
export function demoLocations(q: string) {
  const s = q.trim().toLowerCase();
  // keys must not start with "demo-": the publish route rejects those as planner-mode placeholders
  return CITIES.filter(([n]) => n.toLowerCase().startsWith(s) || (s.length > 2 && n.toLowerCase().includes(s))).slice(0, 8)
    .map(([name, region, type], i) => ({ key: type === "country" ? "IN" : `mm${1000 + i}`, name, type, region: region || undefined, country_code: "IN", country_name: "India" }));
}
const INTERESTS = ["Candles", "Home decor", "Aromatherapy", "Interior design", "Gifts", "Self-care", "Yoga", "Handicraft", "Scented candles", "Coffee", "Meditation", "Weddings"];
export function demoInterests(q: string) {
  const s = q.trim().toLowerCase();
  return INTERESTS.filter((n) => n.toLowerCase().includes(s)).slice(0, 8).map((name, i) => ({ id: `mmi${600 + i}`, name, audience_size_lower_bound: 4_200_000 + i * 830_000, audience_size_upper_bound: 4_900_000 + i * 970_000 }));
}
export function demoEstimate(locations: number, interests: number) {
  const base = 2_400_000 * Math.max(1, locations) / (1 + interests * 0.35);
  return { lower: Math.round(base / 1000) * 1000, upper: Math.round((base * 1.18) / 1000) * 1000 };
}
