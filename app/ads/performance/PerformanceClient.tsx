"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * P2.3 Ads performance — ported 1:1 from
 * ~/workspaces/mira/prototypes/nextbiz-one/ads/performance/wireframe.html.
 * Range chips 7d/30d (+Custom placeholder), 6 clay stat cards with prev-period
 * delta chips (API prev_totals), daily spend bar chart with hover tooltip
 * (spend/clicks/results), per-campaign table sorted by spend. Mock-badged.
 */
const P = "https://cdn.joyverse.fun/mira-assets/phosphor/bold";

type Totals = { spend: number; impressions: number; reach: number; clicks: number; results: number; cost_per_result: number };
type Report = {
  range: string;
  totals: Totals;
  prev_totals: Totals;
  series: { date: string; spend: number; clicks: number; results: number }[];
  currency: "INR";
  demo: boolean;
};
type Campaign = {
  id: string; name: string; objective: string; status: string; source: string;
  insights: { spend: number; clicks: number; results: number; cost_per_result: number };
};

const ST_CLASS: Record<string, string> = {
  ACTIVE: "st ok", PAUSED: "st paused", IN_REVIEW: "st review", DRAFT: "st draft",
};
const ST_LABEL: Record<string, string> = {
  ACTIVE: "Active", PAUSED: "Paused", IN_REVIEW: "In review", DRAFT: "Draft",
};

const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
const num = (n: number) => Math.round(n).toLocaleString("en-IN");
const dayLabel = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });

function delta(cur: number, prev: number): { pct: number; up: boolean } {
  if (prev === 0) return { pct: 0, up: true };
  return { pct: Math.round(((cur - prev) / prev) * 100), up: cur >= prev };
}

const STATS: { k: string; icon: string; get: (t: Totals) => number; fmt: (n: number) => string; goodDown?: boolean }[] = [
  { k: "Spend", icon: "currency-inr", get: (t) => t.spend, fmt: inr },
  { k: "Impressions", icon: "eye", get: (t) => t.impressions, fmt: num },
  { k: "Reach", icon: "users", get: (t) => t.reach, fmt: num },
  { k: "Clicks", icon: "cursor-click", get: (t) => t.clicks, fmt: num },
  { k: "Results", icon: "target", get: (t) => t.results, fmt: num },
  { k: "Cost / result", icon: "chart-line-up", get: (t) => t.cost_per_result, fmt: (n) => (n > 0 ? inr(n) : "—"), goodDown: true },
];

export function PerformanceClient() {
  const [range, setRange] = useState<"7d" | "30d">("7d");
  const [rep, setRep] = useState<Report | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [tip, setTip] = useState<number | null>(null);

  const load = useCallback(async (r: "7d" | "30d") => {
    const [pr, cr] = await Promise.all([
      fetch(`/api/ads/performance?range=${r}`, { cache: "no-store" }),
      fetch("/api/ads/campaigns", { cache: "no-store" }),
    ]);
    if (pr.ok) setRep((await pr.json()) as Report);
    if (cr.ok) setCampaigns(((await cr.json()) as { campaigns: Campaign[] }).campaigns);
  }, []);

  useEffect(() => {
    load(range);
  }, [range, load]);

  const maxSpend = Math.max(...(rep?.series ?? [{ spend: 1 }]).map((s) => s.spend), 1);
  const sorted = [...campaigns].sort((a, b) => b.insights.spend - a.insights.spend);

  return (
    <div className="pzone" data-testid="ads-performance">
      <div className="ptool">
        <div className="rangechips">
          <button className={`chip${range === "7d" ? " on" : ""}`} onClick={() => setRange("7d")} data-testid="range-7d">7 days</button>
          <button className={`chip${range === "30d" ? " on" : ""}`} onClick={() => setRange("30d")} data-testid="range-30d">30 days</button>
          <button className="chip" disabled title="Custom ranges land with a live ad account (demo covers 7d/30d)">Custom</button>
        </div>
        <span className="badge-mock">Demo data</span>
        <span className="mocknote">INR · connect a real ad account to go live</span>
        <a className="btn btn-soft btn-sm" href="/ads"><img src={`${P}/list-bold.svg`} alt="" />Campaigns</a>
      </div>

      {/* totals */}
      <div className="stats">
        {STATS.map((s) => {
          const cur = rep ? s.get(rep.totals) : 0;
          const prev = rep ? s.get(rep.prev_totals) : 0;
          const d = delta(cur, prev);
          const cls = s.goodDown ? (d.up ? "d" : "d good-down") : d.up ? "d" : "d down";
          // cost/result: down is good → good-down; others: up good, down bad
          const clsFinal = s.goodDown ? (d.up ? "d down" : "d good-down") : cls;
          return (
            <div className="stat" key={s.k} data-testid={`stat-${s.k}`}>
              <div className="k"><img src={`${P}/${s.icon}-bold.svg`} alt="" />{s.k}</div>
              <div className="v">{rep ? s.fmt(cur) : "—"}</div>
              {rep && (
                <span className={clsFinal}>
                  <img src={`${P}/trend-${s.goodDown ? (!d.up ? "down" : "up") : d.up ? "up" : "down"}-bold.svg`} alt="" />
                  {d.pct > 0 ? "+" : ""}{d.pct}%{s.k === "Spend" ? " vs prev" : ""}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* daily series */}
      <section className="pcard card">
        <div className="pcard-head">
          <b>Daily spend · last {range === "7d" ? "7 days" : "30 days"}</b>
          <div className="lg">
            <span><i style={{ background: "var(--ads)" }} />Spend</span>
            <span><i style={{ background: "var(--ink-3)" }} />Clicks</span>
            <span><i style={{ background: "var(--chat)" }} />Results</span>
          </div>
        </div>
        <div className="chart" data-testid="chart">
          {(rep?.series ?? []).map((s, i) => (
            <div
              key={s.date}
              className="cbar"
              onMouseEnter={() => setTip(i)}
              onMouseLeave={() => setTip(null)}
              data-testid={`bar-${i}`}
            >
              {tip === i && (
                <div className="ctip" data-testid="ctip">
                  {dayLabel(s.date)}<br />
                  Spend <b>{inr(s.spend)}</b> · Clicks <b>{num(s.clicks)}</b> · Results <b>{num(s.results)}</b>
                </div>
              )}
              <span className="vl">{inr(s.spend)}</span>
              <div className="bar" style={{ height: `${Math.max(3, Math.round((s.spend / maxSpend) * 100))}%` }} />
              <span className="lb">{dayLabel(s.date)}</span>
            </div>
          ))}
        </div>
      </section>

      {/* per-campaign breakdown */}
      <section className="pcard card">
        <div className="pcard-head"><b>Per campaign</b><span className="mocknote" style={{ marginLeft: 2 }}>sorted by spend · lifetime totals</span></div>
        <div className="bscroll">
          <div className="btable">
            <div className="brow bth"><span>Campaign</span><span>Status</span><span>Spend</span><span>Clicks</span><span>Results</span><span>Cost / result</span></div>
            {sorted.map((c) => {
              const has = c.insights.spend > 0;
              return (
                <div className="brow" key={c.id} data-testid={`brow-${c.id}`}>
                  <span className="cn"><span className="dt-ic ads"><img src={`${P}/megaphone-bold.svg`} alt="" /></span><b>{c.name}</b></span>
                  <span className={ST_CLASS[c.status] ?? "st draft"}>{ST_LABEL[c.status] ?? c.status}</span>
                  <span className="num">{has ? inr(c.insights.spend) : "—"}</span>
                  <span className="num">{has ? num(c.insights.clicks) : "—"}</span>
                  <span className="num">{has ? num(c.insights.results) : "—"}</span>
                  <span className="num cpr">{has && c.insights.cost_per_result > 0 ? inr(c.insights.cost_per_result) : "—"}</span>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
