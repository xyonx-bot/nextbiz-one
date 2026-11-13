"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { PairBars } from "@/components/Charts";

/**
 * NextBiz Ads · Performance — design v2 (nextbiz-one-v2/ads-performance). Demo-badged report:
 * KPIs with deltas vs the previous window, daily spend vs results, ad→result funnel, per-campaign table.
 */
type Totals = { spend: number; impressions: number; reach: number; clicks: number; results: number; cost_per_result: number };
type Report = { range: string; totals: Totals; prev_totals: Totals; series: { date: string; spend: number; clicks: number; results: number }[] };
type Camp = { id: string; name: string; status: string; insights: Totals };
const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
const num = (n: number) => (n >= 100000 ? (n / 100000).toFixed(1) + "L" : n.toLocaleString("en-IN"));

function Delta({ cur, prev, lowerIsBetter = false }: { cur: number; prev: number; lowerIsBetter?: boolean }) {
  if (!prev) return <span className="delta flat">—</span>;
  const pct = Math.round(((cur - prev) / prev) * 100), good = lowerIsBetter ? pct <= 0 : pct >= 0;
  return <span className={`delta ${good ? "up" : "down"}`}><Icon name="arrow-up-right" size="xs" style={pct < 0 ? { transform: "rotate(90deg)" } : undefined} />{Math.abs(pct)}% vs previous</span>;
}

export function PerformanceClient() {
  const [range, setRange] = useState<"7d" | "30d">("7d");
  const [rep, setRep] = useState<Report | null>(null);
  const [camps, setCamps] = useState<Camp[]>([]);
  const load = useCallback(async () => {
    const [r, c] = await Promise.all([
      fetch(`/api/ads/performance?range=${range}`, { cache: "no-store" }).then((x) => x.json()).catch(() => null),
      fetch("/api/ads/campaigns", { cache: "no-store" }).then((x) => x.json()).catch(() => null),
    ]);
    if (r?.ok) setRep(r); setCamps(c?.campaigns ?? []);
  }, [range]);
  useEffect(() => { void load(); }, [load]);

  const t = rep?.totals, p = rep?.prev_totals;
  const maxSpend = Math.max(1, ...(rep?.series ?? []).map((s) => s.spend));
  const maxRes = Math.max(1, ...(rep?.series ?? []).map((s) => s.results));
  const top = [...camps].filter((c) => c.insights.spend > 0).sort((a, b) => b.insights.spend - a.insights.spend).slice(0, 6);
  const avgCpr = t?.cost_per_result ?? 0;

  return (
    <div className="pg-ads-perf">
      <div className="page" data-testid="ads-performance">
        <div className="pagehead"><div className="t"><div className="h1">Ads performance <span className="demo" style={{ verticalAlign: 5 }}>Demo data</span></div><p>Did your ads bring real conversations — and customers?</p></div>
          <div className="seg">{(["7d", "30d"] as const).map((r) => <button key={r} className={range === r ? "on" : ""} onClick={() => setRange(r)} data-testid={`range-${r}`}>{r === "7d" ? "7 days" : "30 days"}</button>)}</div></div>
        <section className="grid">
          {t && p ? (
            <>
              <div className="card kp s3"><span>Spend</span><b>{inr(t.spend)}</b><Delta cur={t.spend} prev={p.spend} lowerIsBetter /></div>
              <div className="card kp s3"><span>Results</span><b>{num(t.results)}</b><Delta cur={t.results} prev={p.results} /></div>
              <div className="card kp s3"><span>Cost per result</span><b>{inr(t.cost_per_result)}</b><Delta cur={t.cost_per_result} prev={p.cost_per_result} lowerIsBetter /></div>
              <div className="card kp s3"><span>Click-through rate</span><b>{t.impressions ? ((t.clicks / t.impressions) * 100).toFixed(1) : "0"}%</b><span className="delta flat">{num(t.clicks)} clicks</span></div>
            </>
          ) : [1, 2, 3, 4].map((k) => <div key={k} className="card kp s3"><span className="sk" style={{ height: 52 }} /></div>)}
          <div className="card s8"><div className="card-h"><span className="h3">Spend vs results</span><div className="legend"><span><i style={{ background: "var(--ads)" }} />Spend (scaled)</span><span><i style={{ background: "var(--chat)" }} />Results (scaled)</span></div></div>
            <div style={{ padding: "0 var(--pad) var(--pad)" }}>{rep ? <PairBars a={rep.series.map((s) => Math.round((s.spend / maxSpend) * 100))} b={rep.series.map((s) => Math.round((s.results / maxRes) * 100))} labels={rep.series.map((s) => new Date(s.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" }))} colors={["var(--ads)", "var(--chat)"]} names={["Spend %", "Results %"]} height={250} /> : <span className="sk" style={{ display: "block", height: 250 }} />}
              <p className="xs faint" style={{ fontWeight: 600, marginTop: 6 }}>Bars are scaled to each metric&apos;s best day (100%) so you can compare the shapes.</p></div></div>
          <div className="card s4"><div className="card-h"><span className="h3">From ad to result</span></div>
            {t && <div className="fun">
              <div className="fr"><span>Reached</span><div className="bar"><span style={{ width: "100%" }} /></div><span className="v">{num(t.reach)}<small>people</small></span></div>
              <div className="fr"><span>Saw it</span><div className="bar"><span style={{ width: `${Math.min(100, (t.impressions / Math.max(t.impressions, 1)) * 100)}%` }} /></div><span className="v">{num(t.impressions)}<small>views</small></span></div>
              <div className="fr"><span>Clicked</span><div className="bar"><span style={{ width: `${Math.max(3, (t.clicks / Math.max(t.impressions, 1)) * 100 * 8)}%` }} /></div><span className="v">{num(t.clicks)}<small>{t.impressions ? ((t.clicks / t.impressions) * 100).toFixed(1) : 0}%</small></span></div>
              <div className="fr"><span>Result</span><div className="bar"><span style={{ width: `${Math.max(3, (t.results / Math.max(t.clicks, 1)) * 100 * .8)}%` }} /></div><span className="v">{num(t.results)}<small>{t.clicks ? ((t.results / t.clicks) * 100).toFixed(1) : 0}% of clicks</small></span></div>
            </div>}</div>
          <div className="card s12"><div className="card-h"><span className="h3">By campaign</span><a className="btn-link" style={{ color: "var(--ads-deep)" }} href="/ads">All campaigns</a></div>
            <div style={{ padding: "0 8px 8px", overflowX: "auto" }}><table className="dt"><thead><tr><th>Campaign</th><th className="r">Spend</th><th className="r">Results</th><th className="r col-x">Cost / result</th><th className="r col-x">Clicks</th></tr></thead>
              <tbody>{top.map((c) => { const cpr = c.insights.cost_per_result; return (
                <tr key={c.id}><td><b className="small">{c.name}</b></td><td className="r num">{inr(c.insights.spend)}</td><td className="r num">{num(c.insights.results)}</td>
                  <td className="r num col-x" style={{ color: avgCpr && cpr > avgCpr * 1.25 ? "var(--danger-deep)" : avgCpr && cpr < avgCpr * .8 ? "var(--chat-deep)" : undefined }}>{cpr ? inr(cpr) : "—"}</td><td className="r num col-x">{num(c.insights.clicks)}</td></tr>); })}
                {top.length === 0 && <tr><td colSpan={5}><div className="empty"><p>No campaign spend in this period.</p></div></td></tr>}</tbody></table></div>
            {top.length > 1 && avgCpr > 0 && (() => { const worst = [...top].sort((a, b) => b.insights.cost_per_result - a.insights.cost_per_result)[0], best = [...top].sort((a, b) => a.insights.cost_per_result - b.insights.cost_per_result)[0]; return worst.id !== best.id && worst.insights.cost_per_result > avgCpr * 1.2 ? (
              <div className="card-f"><div className="note warn" style={{ flex: 1, fontSize: "var(--fs-xs)" }}><Icon name="lightbulb" size="sm" /><span><b>Tip:</b> {worst.name} costs {Math.round((worst.insights.cost_per_result / avgCpr - 1) * 100)}% more per result than average. Consider moving budget to {best.name}.</span></div></div>) : null; })()}
          </div>
        </section>
      </div>
    </div>
  );
}
