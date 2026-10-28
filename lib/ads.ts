/**
 * Ads module (P2.1–P2.3) — mock data layer.
 *
 * MOCK-BADGED by necessity AND by the backlog's mock-vs-live rule: the Meta
 * permission audit (Oct 27, live Graph probe) found zero ad accounts on the
 * business and no ads_read/ads_management scopes on the system-user token.
 * So v1 of Ads is deterministic DEMO fixtures + user-created drafts persisted
 * in ads_mock_campaigns. When a real ad account + ads_read exist, a
 * lib/meta-ads-client replaces the internals of these functions and the
 * routes/UI stay untouched.
 *
 * Fixtures are seeded from the workspace id → the same list every call
 * (no flicker between renders), coherent INR numbers, Meta-style enums.
 */

export type AdsObjective =
  | "OUTCOME_ENGAGEMENT"
  | "OUTCOME_TRAFFIC"
  | "OUTCOME_LEADS"
  | "OUTCOME_SALES"
  | "OUTCOME_AWARENESS";

export const OBJECTIVE_LABELS: Record<AdsObjective, string> = {
  OUTCOME_ENGAGEMENT: "WhatsApp messages",
  OUTCOME_TRAFFIC: "Website visits",
  OUTCOME_LEADS: "Lead signups",
  OUTCOME_SALES: "Catalog sales",
  OUTCOME_AWARENESS: "Brand awareness",
};

export type AdsCampaign = {
  id: string;
  name: string;
  objective: AdsObjective;
  status: "ACTIVE" | "PAUSED" | "IN_REVIEW" | "DRAFT";
  daily_budget: number; // INR rupees
  start_time: string | null;
  stop_time: string | null;
  destination: "whatsapp" | "website" | null;
  source: "demo" | "draft"; // demo fixtures are read-only; drafts are user rows
  insights: {
    spend: number; impressions: number; reach: number; clicks: number;
    results: number; cost_per_result: number; // INR, 2dp
  };
};

// deterministic RNG: same workspace id => same numbers on every call
function mulberry32(a: number) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seedNum(s: string) {
  let h = 0;
  for (const c of s) h = (Math.imul(h, 31) + c.charCodeAt(0)) | 0;
  return h;
}
const r2 = (n: number) => Math.round(n * 100) / 100;

const DEMO_NAMES = [
  "Festive Offers Blast", "Diwali Retargeting", "Lead Magnet Carousel",
  "WhatsApp Support Push", "Website Traffic Test", "Catalog Sales Pilot",
  "Brand Awareness Crawl",
];
const DEMO_OBJECTIVES: AdsObjective[] = [
  "OUTCOME_ENGAGEMENT", "OUTCOME_TRAFFIC", "OUTCOME_LEADS",
  "OUTCOME_SALES", "OUTCOME_AWARENESS", "OUTCOME_ENGAGEMENT", "OUTCOME_AWARENESS",
];
const DEMO_STATUSES: AdsCampaign["status"][] = [
  "ACTIVE", "PAUSED", "ACTIVE", "IN_REVIEW", "DRAFT", "ACTIVE", "PAUSED",
];

/** Demo fixtures for a workspace — stable, coherent, INR. */
export function seedCampaigns(workspaceId: string): AdsCampaign[] {
  const rnd = mulberry32(seedNum(workspaceId));
  const now = Date.now();
  return DEMO_NAMES.map((name, i) => {
    const objective = DEMO_OBJECTIVES[i];
    const status = DEMO_STATUSES[i];
    const running = status === "ACTIVE" || status === "PAUSED";
    const daily = 300 + Math.floor(rnd() * 2200); // ₹300–₹2500
    const days = running ? 3 + Math.floor(rnd() * 25) : 0;
    const spend = r2(daily * days * (0.55 + rnd() * 0.4));
    const cpm = 60 + rnd() * 120; // ₹60–₹180 CPM
    const impressions = Math.max(1, Math.round((spend / cpm) * 1000));
    const freq = 1.2 + rnd() * 1.2;
    const reach = Math.max(1, Math.round(impressions / freq));
    const ctr = 0.008 + rnd() * 0.027; // 0.8%–3.5%
    const clicks = Math.round(impressions * ctr);
    const cvr = 0.05 + rnd() * 0.13;
    const results = objective === "OUTCOME_AWARENESS" ? clicks : Math.max(1, Math.round(clicks * cvr));
    const start = new Date(now - days * 864e5);
    const stop = new Date(start.getTime() + 30 * 864e5);
    return {
      id: `demo-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      name, objective, status,
      daily_budget: daily,
      start_time: running ? start.toISOString() : null,
      stop_time: running ? stop.toISOString() : null,
      destination: objective === "OUTCOME_TRAFFIC" || objective === "OUTCOME_SALES" ? "website" : "whatsapp",
      source: "demo" as const,
      insights: {
        spend, impressions, reach, clicks, results,
        cost_per_result: results > 0 ? r2(spend / results) : 0,
      },
    };
  });
}

/** Search + status filter (case-insensitive name/objective match). */
export function filterCampaigns(list: AdsCampaign[], q: string, status?: string | null): AdsCampaign[] {
  const needle = q.trim().toLowerCase();
  return list.filter((c) =>
    (!status || status === "all" || c.status === status) &&
    (!needle ||
      c.name.toLowerCase().includes(needle) ||
      (OBJECTIVE_LABELS[c.objective] ?? c.objective).toLowerCase().includes(needle)));
}

export type PerformancePoint = { date: string; spend: number; clicks: number; results: number };
export type PerformanceReport = {
  range: string;
  totals: { spend: number; impressions: number; reach: number; clicks: number; results: number; cost_per_result: number };
  series: PerformancePoint[];
  currency: "INR";
  demo: true;
};

/** Aggregate performance (P2.3) over the last N days, deterministic split. */
export function performance(campaigns: AdsCampaign[], days: 7 | 30, workspaceId: string): PerformanceReport {
  const rnd = mulberry32(seedNum(workspaceId + ":perf"));
  const totals = campaigns.reduce(
    (a, c) => ({
      spend: r2(a.spend + c.insights.spend),
      impressions: a.impressions + c.insights.impressions,
      reach: a.reach + c.insights.reach,
      clicks: a.clicks + c.insights.clicks,
      results: a.results + c.insights.results,
    }),
    { spend: 0, impressions: 0, reach: 0, clicks: 0, results: 0 },
  );
  // split each total across `days` with seeded wiggle, normalized to keep sums
  const w: number[] = [];
  let wsum = 0;
  for (let i = 0; i < days; i++) { const v = 0.6 + rnd() * 0.8; w.push(v); wsum += v; }
  const series: PerformancePoint[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 864e5);
    const f = w[days - 1 - i] / wsum;
    series.push({
      date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
      spend: r2(totals.spend * f),
      clicks: Math.round(totals.clicks * f),
      results: Math.round(totals.results * f),
    });
  }
  return {
    range: `${days}d`,
    totals: { ...totals, cost_per_result: totals.results > 0 ? r2(totals.spend / totals.results) : 0 },
    series,
    currency: "INR",
    demo: true,
  };
}

/** A DB draft row → the campaign shape the UI consumes (no insights yet). */
export function draftToCampaign(row: {
  id: string; name: string; objective: string; status: string; daily_budget: number;
  start_time: Date | null; stop_time: Date | null; destination: string | null;
}): AdsCampaign {
  const zero = { spend: 0, impressions: 0, reach: 0, clicks: 0, results: 0, cost_per_result: 0 };
  const status = row.status === "in_review" ? "IN_REVIEW" : row.status === "paused" ? "PAUSED"
    : row.status === "active" ? "ACTIVE" : "DRAFT";
  return {
    id: row.id,
    name: row.name,
    objective: row.objective as AdsObjective,
    status: status as AdsCampaign["status"],
    daily_budget: row.daily_budget,
    start_time: row.start_time ? new Date(row.start_time).toISOString() : null,
    stop_time: row.stop_time ? new Date(row.stop_time).toISOString() : null,
    destination: (row.destination as "whatsapp" | "website" | null) ?? null,
    source: "draft",
    insights: status === "ACTIVE" ? zero : zero, // drafts/in_review never accrue mock insights in v1
  };
}
