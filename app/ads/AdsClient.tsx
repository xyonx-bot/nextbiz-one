"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";

/**
 * NextBiz Ads · Campaigns — design v2 (nextbiz-one-v2/ads-campaigns). Demo data until a Meta ad account is
 * connected: demo fixtures are read-only; user drafts can be paused/resumed/cancelled (mock actions).
 */
type Camp = {
  id: string; name: string; objective: string; status: "ACTIVE" | "PAUSED" | "IN_REVIEW" | "DRAFT" | "CANCELLED";
  daily_budget: number; start_time: string | null; stop_time: string | null; destination: "whatsapp" | "website" | null; source: "demo" | "draft";
  insights: { spend: number; impressions: number; reach: number; clicks: number; results: number; cost_per_result: number };
};
const OBJ: Record<string, string> = { OUTCOME_ENGAGEMENT: "WhatsApp messages", OUTCOME_TRAFFIC: "Website visits", OUTCOME_LEADS: "Lead signups", OUTCOME_SALES: "Catalog sales", OUTCOME_AWARENESS: "Brand awareness" };
const ST: Record<string, [string, string]> = { ACTIVE: ["ok", "Active"], PAUSED: ["neutral", "Paused"], IN_REVIEW: ["warn", "In review"], DRAFT: ["neutral", "Draft"], CANCELLED: ["bad", "Cancelled"] };
const THUMB = ["t1", "t2", "t3", "t4"];
const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

export function AdsClient({ initialStatus }: { initialStatus?: string | null }) {
  const [list, setList] = useState<Camp[] | null>(null);
  const [filter, setFilter] = useState<string>(initialStatus ?? "all");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Camp | null>(null);
  const [note, setNote] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);

  const load = useCallback(async () => {
    const d = await fetch("/api/ads/campaigns", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    setList(d?.campaigns ?? []);
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (note) { const t = setTimeout(() => setNote(null), 4000); return () => clearTimeout(t); } }, [note]);

  async function setStatus(c: Camp, status: "active" | "paused" | "cancelled") {
    const res = await fetch(`/api/ads/campaigns/${c.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    const d = await res.json().catch(() => null);
    setNote(res.ok && d?.ok !== false ? { kind: "ok", text: `${c.name} ${status === "active" ? "resumed" : status}` } : { kind: "bad", text: d?.error ?? "Couldn't update the campaign" });
    await load();
    if (sel?.id === c.id) setSel(null);
  }

  const counts = useMemo(() => { const c: Record<string, number> = { all: list?.length ?? 0 }; for (const x of list ?? []) c[x.status] = (c[x.status] ?? 0) + 1; return c; }, [list]);
  const shown = (list ?? []).filter((c) => (filter === "all" || c.status === filter) && (!q || c.name.toLowerCase().includes(q.toLowerCase())));
  const tot = (list ?? []).reduce((a, c) => ({ spend: a.spend + c.insights.spend, results: a.results + c.insights.results, clicks: a.clicks + c.insights.clicks, budget: a.budget + (c.status === "ACTIVE" ? c.daily_budget : 0) }), { spend: 0, results: 0, clicks: 0, budget: 0 });

  return (
    <div className="pg-ads-campaigns">
      <div className="page azone" data-testid="ads-campaigns">
        <div className="banner"><span className="icon-tile orange"><Icon name="info" /></span><span className="grow"><b>You&apos;re looking at demo data.</b> Connect a Meta ad account with a payment method to run real click-to-WhatsApp campaigns.</span><a className="btn btn-soft btn-sm" href="/settings#channels">Ad account</a></div>
        <div className="strip">
          <div className="card"><span>Spend <span className="demo">Demo</span></span><b>{inr(tot.spend)}</b><small>across {list?.length ?? 0} campaigns</small></div>
          <div className="card"><span>Results</span><b>{tot.results.toLocaleString("en-IN")}</b><small>chats, leads, visits or sales</small></div>
          <div className="card"><span>Cost per result</span><b>{tot.results ? inr(tot.spend / tot.results) : "—"}</b><small>average across campaigns</small></div>
          <div className="card"><span>Active daily budget</span><b>{inr(tot.budget)}</b><small>{counts.ACTIVE ?? 0} active campaigns</small></div>
        </div>
        <section className="card">
          <div className="tb">
            <div className="chips">{(["all", "ACTIVE", "PAUSED", "IN_REVIEW", "DRAFT"] as const).map((f) => <button key={f} className={`chip${filter === f ? " on" : ""}`} onClick={() => setFilter(f)} data-testid={`pill-${f}`}>{f === "all" ? "All" : ST[f][1]} <span className="n">{counts[f] ?? 0}</span></button>)}</div>
            <span className="sp" /><label className="search"><Icon name="magnifying-glass" size="sm" /><input placeholder="Search campaigns" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search campaigns" /></label>
          </div>
          <div style={{ padding: "0 8px 8px", overflowX: "auto" }}>
            <table className="dt"><thead><tr><th>Campaign</th><th>Status</th><th className="col-obj">Goal</th><th className="col-bud">Budget / day</th><th className="r">Spend</th><th className="r col-res">Results</th><th className="r col-cpr">Cost / result</th><th /></tr></thead>
              <tbody>
                {list === null && [1, 2, 3].map((k) => <tr key={k}><td colSpan={8}><span className="sk" style={{ display: "block", height: 34 }} /></td></tr>)}
                {list && shown.length === 0 && <tr><td colSpan={8}><div className="empty"><p>No campaigns here.</p><div className="acts"><a className="btn btn-primary btn-sm" href="/ads/new">Create a campaign</a></div></div></td></tr>}
                {shown.map((c, i) => (
                  <tr key={c.id} className={`crow${sel?.id === c.id ? " on" : ""}`} data-testid={`crow-${c.source}-${c.id}`} onClick={() => setSel(c)}>
                    <td><div className="row" style={{ gap: 10 }}><span className={`thumb ${THUMB[i % 4]}`}><Icon name={c.destination === "whatsapp" ? "whatsapp-logo" : "image"} /></span><span className="cname"><b>{c.name}</b><small>{c.source === "demo" ? "Demo campaign" : "Your draft"}</small></span></div></td>
                    <td><span className={`pill sm ${ST[c.status]?.[0] ?? "neutral"}`}>{ST[c.status]?.[1] ?? c.status}</span></td>
                    <td className="col-obj small muted" style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{OBJ[c.objective] ?? c.objective}</td>
                    <td className="col-bud"><div className="bud numc">{inr(c.daily_budget)}<div className="meter"><span style={{ width: `${c.daily_budget ? Math.min(100, (c.insights.spend / Math.max(1, c.daily_budget * 30)) * 100) : 0}%` }} /></div></div></td>
                    <td className="r numc">{c.insights.spend ? inr(c.insights.spend) : "—"}</td>
                    <td className="r numc col-res">{c.insights.results ? c.insights.results.toLocaleString("en-IN") : "—"}</td>
                    <td className="r numc col-cpr">{c.insights.cost_per_result ? inr(c.insights.cost_per_result) : "—"}</td>
                    <td className="r" onClick={(e) => e.stopPropagation()}>
                      {c.source === "draft" && (c.status === "ACTIVE" || c.status === "PAUSED")
                        ? <button className={`tog${c.status === "ACTIVE" ? " on" : ""}`} role="switch" aria-checked={c.status === "ACTIVE"} aria-label={c.status === "ACTIVE" ? "Pause" : "Resume"} onClick={() => void setStatus(c, c.status === "ACTIVE" ? "paused" : "active")} />
                        : <Icon name="caret-right" style={{ color: "var(--ink-4)" }} />}
                    </td>
                  </tr>
                ))}
              </tbody></table>
          </div>
        </section>
      </div>

      <div className={`scrim${sel ? " open" : ""}`} onClick={() => setSel(null)} />
      <aside className={`drawer wide${sel ? " open" : ""}`} aria-label="Campaign details" aria-hidden={!sel}>
        {sel && (
          <>
            <div className="dh cd-head" style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: 18, borderBottom: "1px solid var(--line)" }}>
              <span className="icon-tile lg orange"><Icon name="megaphone" /></span>
              <div className="grow tt"><b style={{ display: "block", fontSize: "var(--fs-xl)", fontWeight: 800, letterSpacing: "-.02em" }}>{sel.name}</b><span className="small muted" style={{ fontWeight: 600 }}>{OBJ[sel.objective]} · {sel.destination === "whatsapp" ? "opens a WhatsApp chat" : "sends people to your website"}</span></div>
              <span className={`pill ${ST[sel.status][0]}`}>{ST[sel.status][1]}</span><span className="demo">Demo</span>
              <button className="btn btn-ghost btn-icon" onClick={() => setSel(null)} aria-label="Close"><Icon name="x" /></button>
            </div>
            <div className="cd-body" style={{ flex: 1, overflow: "auto", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="eyebrow">Insights · last 30 days</div>
              <div className="mini" data-testid="insights-wells" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                {([["Spend", inr(sel.insights.spend)], ["Reach", sel.insights.reach.toLocaleString("en-IN")], ["Clicks", sel.insights.clicks.toLocaleString("en-IN")], ["Results", sel.insights.results.toLocaleString("en-IN")]] as const).map(([k, v]) => (
                  <div key={k} className="well" style={{ padding: 12 }}><span className="eyebrow">{k}</span><div className="d h2 num">{v}</div></div>))}
              </div>
              {sel.insights.spend === 0 && <div className="note"><Icon name="chart-line-up" /><span>No results yet — this campaign hasn&apos;t run.</span></div>}
              <div className="eyebrow">Settings</div>
              <dl className="kv"><dt>Goal</dt><dd>{OBJ[sel.objective]}</dd><dt>Daily budget</dt><dd>{inr(sel.daily_budget)} / day</dd><dt>Schedule</dt><dd>{sel.start_time ? new Date(sel.start_time).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "Starts immediately"}{sel.stop_time ? ` → ${new Date(sel.stop_time).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : " · no end date"}</dd><dt>Cost per result</dt><dd>{sel.insights.cost_per_result ? inr(sel.insights.cost_per_result) : "—"}</dd></dl>
            </div>
            <div className="card-f">
              <a className="btn btn-soft btn-sm" href="/ads/performance"><Icon name="chart-line-up" />Performance</a><span className="sp" />
              {sel.source === "demo" ? <span className="xs faint" style={{ fontWeight: 600 }}>Demo campaigns are read-only</span> : (
                <>
                  {sel.status !== "CANCELLED" && <button className="btn btn-danger btn-sm" onClick={() => void setStatus(sel, "cancelled")}>Cancel campaign</button>}
                  {sel.status === "ACTIVE" && <button className="btn btn-soft btn-sm" onClick={() => void setStatus(sel, "paused")}><Icon name="pause" />Pause</button>}
                  {sel.status === "PAUSED" && <button className="btn btn-primary btn-sm" onClick={() => void setStatus(sel, "active")}><Icon name="play" />Resume</button>}
                </>
              )}
            </div>
          </>
        )}
      </aside>
      {note && <div role="status" style={{ position: "fixed", bottom: 90, left: "50%", transform: "translateX(-50%)", background: "var(--surface)", border: `1px solid ${note.kind === "ok" ? "var(--chat-line)" : "var(--danger-line)"}`, color: note.kind === "ok" ? "var(--chat-deep)" : "var(--danger-deep)", boxShadow: "var(--shadow-2)", borderRadius: 999, padding: "9px 16px", fontSize: 12, fontWeight: 700, zIndex: 95 }}>{note.text}</div>}
    </div>
  );
}
