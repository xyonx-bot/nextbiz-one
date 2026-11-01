"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * P2.1 Ads campaigns — master-detail, ported 1:1 from
 * ~/workspaces/mira/prototypes/nextbiz-one/ads/campaigns/wireframe.html.
 * Mock-badged (Meta audit: no ad account / no ads perms). Demo rows are
 * read-only (PATCH → 409); drafts support pause/resume. Mobile <640 uses the
 * body.show-detail master→detail toggle like contacts.
 */
type Campaign = {
  id: string;
  name: string;
  objective: string;
  status: "ACTIVE" | "PAUSED" | "IN_REVIEW" | "DRAFT" | "CANCELLED";
  daily_budget: number;
  start_time: string | null;
  stop_time: string | null;
  destination: "whatsapp" | "website" | null;
  source: "demo" | "draft";
  insights: { spend: number; impressions: number; reach: number; clicks: number; results: number; cost_per_result: number };
};

const OBJECTIVE_LABELS: Record<string, string> = {
  OUTCOME_ENGAGEMENT: "WhatsApp messages",
  OUTCOME_TRAFFIC: "Website visits",
  OUTCOME_LEADS: "Lead signups",
  OUTCOME_SALES: "Catalog sales",
  OUTCOME_AWARENESS: "Brand awareness",
};

const ST_CLASS: Record<Campaign["status"], string> = {
  ACTIVE: "st ok",
  PAUSED: "st paused",
  IN_REVIEW: "st review",
  DRAFT: "st draft",
  CANCELLED: "st cancelled",
};
const ST_LABEL: Record<Campaign["status"], string> = {
  ACTIVE: "Active",
  PAUSED: "Paused",
  IN_REVIEW: "In review",
  DRAFT: "Draft",
  CANCELLED: "Cancelled",
};

const P = "https://cdn.joyverse.fun/mira-assets/phosphor/bold";

const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : null;

const PILLS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "ACTIVE", label: "Active" },
  { key: "PAUSED", label: "Paused" },
  { key: "IN_REVIEW", label: "In review" },
  { key: "DRAFT", label: "Drafts" },
  { key: "CANCELLED", label: "Cancelled" },
];

export function AdsClient({ initialStatus }: { initialStatus: string }) {
  const [all, setAll] = useState<Campaign[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>(initialStatus);
  const [sel, setSel] = useState<Campaign | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/ads/campaigns", { cache: "no-store" });
    if (!r.ok) return;
    const d = (await r.json()) as { campaigns: Campaign[] };
    setAll(d.campaigns);
    setSel((cur) => cur ?? d.campaigns[0] ?? null);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => () => document.body.classList.remove("show-detail"), []);

  // kebab menu: close on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".cd-menu-wrap")) { setMenuOpen(false); setConfirmCancel(false); }
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [menuOpen]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: all.length };
    for (const p of PILLS) if (p.key !== "all") c[p.key] = all.filter((x) => x.status === p.key).length;
    return c;
  }, [all]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter(
      (c) =>
        (status === "all" || c.status === status) &&
        (!needle ||
          c.name.toLowerCase().includes(needle) ||
          (OBJECTIVE_LABELS[c.objective] ?? c.objective).toLowerCase().includes(needle)),
    );
  }, [all, q, status]);

  async function pick(c: Campaign) {
    setSel(c);
    setNote("");
    if (window.innerWidth < 640) document.body.classList.add("show-detail");
    const r = await fetch(`/api/ads/campaigns/${c.id}`, { cache: "no-store" });
    if (r.ok) {
      const d = (await r.json()) as { campaign: Campaign };
      setSel(d.campaign);
      setAll((prev) => prev.map((x) => (x.id === d.campaign.id ? d.campaign : x)));
    }
  }

  async function patchStatus(next: string) {
    if (!sel) return;
    setBusy(true);
    setNote("");
    const r = await fetch(`/api/ads/campaigns/${sel.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    if (r.ok) {
      const d = (await r.json()) as { campaign: Campaign };
      setSel(d.campaign);
      setAll((prev) => prev.map((x) => (x.id === d.campaign.id ? d.campaign : x)));
      setMenuOpen(false);
      setConfirmCancel(false);
    } else {
      setNote("Could not update status — try again.");
    }
    setBusy(false);
  }

  async function toggleStatus() {
    if (!sel || sel.source === "demo") return;
    await patchStatus(sel.status === "ACTIVE" ? "paused" : "active");
  }

  async function cancelCampaign() {
    if (!sel || sel.source === "demo") return;
    await patchStatus("cancelled");
  }

  const running = sel ? sel.insights.spend > 0 : false;
  const demo = sel?.source === "demo";
  const actionLabel =
    sel?.status === "ACTIVE" ? "Pause campaign" : sel?.status === "PAUSED" ? "Resume campaign" : sel?.status === "DRAFT" ? "Activate campaign" : sel?.status === "CANCELLED" ? "Cancelled" : "In review";

  return (
    <div className="azone" data-testid="ads-campaigns">
      {/* col 1: campaign list */}
      <section className="clist card" aria-label="Campaigns">
        <div className="clist-head">
          <div className="tpills" role="tablist" aria-label="Status filter">
            {PILLS.map((p) => (
              <button
                key={p.key}
                className={`chip${status === p.key ? " on" : ""}`}
                onClick={() => setStatus(p.key)}
                data-testid={`pill-${p.key}`}
              >
                {p.label} <span className="n">{counts[p.key] ?? 0}</span>
              </button>
            ))}
          </div>
          <div className="tsearch">
            <img src={`${P}/magnifying-glass-bold.svg`} alt="" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search campaigns…"
              aria-label="Search campaigns"
              data-testid="ads-search"
            />
            <span className="badge-mock" style={{ marginLeft: "auto" }}>Demo data</span>
          </div>
        </div>
        <div className="crows">
          {rows.length === 0 && (
            <div className="cempty">
              <img src={`${P}/magnifying-glass-bold.svg`} alt="" />
              <span>{q ? <>No campaigns match &ldquo;{q}&rdquo;</> : "No campaigns in this filter yet"}</span>
              {q && <button className="btn btn-soft btn-sm" onClick={() => setQ("")}>Clear search</button>}
            </div>
          )}
          {rows.map((c) => (
            <div
              key={c.id}
              className={`crow${sel?.id === c.id ? " on" : ""}`}
              onClick={() => pick(c)}
              data-testid={`crow-${c.id}`}
            >
              <div className="r1">
                <span className="dt-ic ads"><img src={`${P}/megaphone-bold.svg`} alt="" /></span>
                <b>{c.name}</b>
                <span className={ST_CLASS[c.status]}>{ST_LABEL[c.status]}</span>
              </div>
              <div className="r2">
                <span className="obj">{OBJECTIVE_LABELS[c.objective] ?? c.objective}</span>
                <span className="sep">·</span>
                <span>{inr(c.daily_budget)}/day</span>
                <span className="spend">{c.insights.spend > 0 ? `${inr(c.insights.spend)} spent` : "—"}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* col 2: campaign detail */}
      <section className="cdetail card" aria-label="Campaign detail">
        {sel ? (
          <>
            <div className="cd-head">
              <button className="back" onClick={() => document.body.classList.remove("show-detail")} aria-label="Back" data-testid="detail-back">
                <img src={`${P}/arrow-left-bold.svg`} alt="" />
              </button>
              <span className="dt-ic ads big"><img src={`${P}/megaphone-bold.svg`} alt="" /></span>
              <div className="tt">
                <b>{sel.name}</b>
                <span>{OBJECTIVE_LABELS[sel.objective] ?? sel.objective} · destination {sel.destination ?? "—"}</span>
              </div>
              <span className={ST_CLASS[sel.status]}>{ST_LABEL[sel.status]}</span>
              <span className="badge-mock">Demo data</span>
              <div className="acts">
                <button className="btn btn-soft btn-sm" disabled title={demo ? "Demo campaigns are read-only — connect a real ad account" : "Not available in demo mode"}>
                  <img src={`${P}/copy-bold.svg`} alt="" />Duplicate
                </button>
                <button
                  className="btn btn-ads btn-sm"
                  disabled={demo || busy || sel.status === "IN_REVIEW" || sel.status === "CANCELLED"}
                  title={demo ? "Demo campaigns are read-only (API returns 409)" : sel.status === "IN_REVIEW" ? "Under review with Meta" : sel.status === "CANCELLED" ? "Cancelled" : undefined}
                  onClick={toggleStatus}
                  data-testid="toggle-status"
                >
                  <img src={`${P}/${sel.status === "ACTIVE" ? "pause" : "play"}-bold.svg`} alt="" />{actionLabel}
                </button>
                <div className="cd-menu-wrap">
                  <button
                    className="btn btn-soft btn-sm"
                    aria-label="More actions"
                    data-testid="kebab"
                    onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); setConfirmCancel(false); }}
                  >
                    <img src={`${P}/dots-three-bold.svg`} alt="" />
                  </button>
                  {menuOpen && (
                    <div className="cd-menu" data-testid="cd-menu" role="menu">
                      <button className="mi" disabled={demo} title={demo ? "Demo campaigns are read-only" : undefined} onClick={() => setMenuOpen(false)}>
                        <img src={`${P}/copy-bold.svg`} alt="" />Duplicate
                      </button>
                      <button className="mi" disabled={demo || busy || sel.status === "IN_REVIEW" || sel.status === "CANCELLED"} onClick={toggleStatus}>
                        <img src={`${P}/${sel.status === "ACTIVE" ? "pause" : "play"}-bold.svg`} alt="" />{actionLabel}
                      </button>
                      {sel.status !== "CANCELLED" && (
                        <button
                          className={`mi danger${confirmCancel ? " armed" : ""}`}
                          disabled={demo || busy}
                          title={demo ? "Demo campaigns are read-only (API returns 409)" : undefined}
                          data-testid="cancel-campaign"
                          onClick={() => (confirmCancel ? cancelCampaign() : setConfirmCancel(true))}
                        >
                          <img src={`${P}/x-circle-bold.svg`} alt="" />
                          {confirmCancel ? "Tap again to confirm" : sel.status === "IN_REVIEW" ? "Cancel review" : "Cancel campaign"}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="cd-body">
              {sel.status === "IN_REVIEW" && (
                <div className="banner-review" data-testid="review-banner">
                  <img src={`${P}/warning-circle-bold.svg`} alt="" />
                  <div><b>Under review</b><span>Meta typically responds within a few hours.</span></div>
                </div>
              )}
              <div>
                <div className="mlab" style={{ marginBottom: 7 }}>Insights · last 30 days</div>
                {running ? (
                  <div className="wells" data-testid="insights-wells">
                    <div className="well"><div className="k">Spend</div><div className="v">{inr(sel.insights.spend)}</div></div>
                    <div className="well"><div className="k">Impressions</div><div className="v">{sel.insights.impressions.toLocaleString("en-IN")}</div></div>
                    <div className="well"><div className="k">Reach</div><div className="v">{sel.insights.reach.toLocaleString("en-IN")}</div></div>
                    <div className="well"><div className="k">Clicks</div><div className="v">{sel.insights.clicks.toLocaleString("en-IN")}</div></div>
                    <div className="well"><div className="k">Results</div><div className="v">{sel.insights.results.toLocaleString("en-IN")}</div></div>
                    <div className="well"><div className="k">Cost/result</div><div className="v">{sel.insights.cost_per_result > 0 ? inr(sel.insights.cost_per_result) : "—"}</div></div>
                  </div>
                ) : (
                  <div className="zerores" data-testid="zerores">
                    <img src={`${P}/chart-line-up-bold.svg`} alt="" />
                    No results yet — this campaign hasn&apos;t run
                  </div>
                )}
              </div>
              <div className="cd-grid">
                <div>
                  <div className="mlab" style={{ marginBottom: 9 }}>Campaign settings</div>
                  <div className="mgrid">
                    <div className="m"><div className="k">Objective</div><div className="v"><span className="dt-ic ads" style={{ width: 20, height: 20, borderRadius: 6 }}><img src={`${P}/target-bold.svg`} alt="" style={{ width: 10, height: 10 }} /></span>{OBJECTIVE_LABELS[sel.objective] ?? sel.objective}</div></div>
                    <div className="m"><div className="k">Destination</div><div className="v"><img src={`${P}/${sel.destination === "whatsapp" ? "whatsapp-logo" : "globe"}-bold.svg`} alt="" style={{ width: 12, height: 12, color: "var(--ink-3)" }} />{sel.destination === "website" ? "Website" : "WhatsApp"} — {sel.destination === "website" ? "link clicks to your site" : "messages to Acme Studio"}</div></div>
                    <div className="m"><div className="k">Daily budget</div><div className="v"><img src={`${P}/currency-inr-bold.svg`} alt="" />{inr(sel.daily_budget)} / day</div></div>
                    <div className="m"><div className="k">Schedule</div><div className="v"><img src={`${P}/calendar-blank-bold.svg`} alt="" />{sel.start_time ? `${fmtDate(sel.start_time)} – ${sel.stop_time ? fmtDate(sel.stop_time) : "ongoing"}` : "Starts immediately"}</div></div>
                    <div className="m"><div className="k">Source</div><div className="v"><span className="badge-mock">Demo data</span>{demo ? "fixture row · read-only" : "your draft · editable"}</div></div>
                    <div className="m"><div className="k">Status</div><div className="v"><span className={ST_CLASS[sel.status]}>{ST_LABEL[sel.status]}</span>{demo ? "demo rows are read-only (API 409)" : note || "drafts support pause/resume"}</div></div>
                  </div>
                </div>
                <div>
                  <div className="mlab" style={{ marginBottom: 6 }}>Ad sets &amp; ads · read-only</div>
                  {demo ? (
                    <>
                      <div className="arow"><span className="dt-ic ads"><img src={`${P}/funnel-bold.svg`} alt="" /></span><div><b>Festive audience — 18-45</b><div className="meta">Ad set · Active · ₹7,110 spend</div></div><span className="st ok" style={{ marginLeft: "auto" }}>Active</span></div>
                      <div className="arow"><span className="dt-ic ads"><img src={`${P}/funnel-bold.svg`} alt="" /></span><div><b>Website visitors</b><div className="meta">Ad set · Active · ₹5,370 spend</div></div><span className="st ok" style={{ marginLeft: "auto" }}>Active</span></div>
                    </>
                  ) : (
                    <div className="cempty" style={{ padding: "14px 10px" }}>
                      <img src={`${P}/funnel-bold.svg`} alt="" />
                      <span>No ad sets yet — added when the campaign goes live</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="cempty" style={{ margin: "auto" }}>
            <img src={`${P}/megaphone-bold.svg`} alt="" />
            <span>Select a campaign to see its details</span>
          </div>
        )}
      </section>
    </div>
  );
}
