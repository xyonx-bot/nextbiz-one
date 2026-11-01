"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * P2.1 Ads campaigns v2 — master-detail, ported 1:1 from
 * ~/workspaces/mira/prototypes/nextbiz-one/ads/campaigns/wireframe.html v2
 * (Joydip Nov 1 redesign) + HANDOFF.md "Revisions Nov 1" + port-bug list:
 * compact 4-col left-aligned rows w/ hairline dividers, kebab on EVERY row +
 * detail head, ads-tint insights strip (no deltas), two sunken .cdc panels,
 * settings as 108px definition list (Source=badge only, Status=pill only),
 * peach read-only note. Mock-badged (Meta audit: no ad account / no ads perms).
 * Demo rows read-only (PATCH → 409); drafts support pause/resume/duplicate.
 * Mobile <640 uses body.show-detail master→detail like contacts.
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
const num = (n: number) => Math.round(n).toLocaleString("en-IN");
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : null;
const destLabel = (d: Campaign["destination"]) => (d === "website" ? "Website" : d === "whatsapp" ? "WhatsApp" : null);

const PILLS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "ACTIVE", label: "Active" },
  { key: "PAUSED", label: "Paused" },
  { key: "IN_REVIEW", label: "In review" },
  { key: "DRAFT", label: "Drafts" },
  { key: "CANCELLED", label: "Cancelled" },
];

export function AdsClient({ initialStatus }: { initialStatus: string }) {
  const router = useRouter();
  const [all, setAll] = useState<Campaign[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>(initialStatus);
  const [sel, setSel] = useState<Campaign | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [openKebab, setOpenKebab] = useState<string | null>(null); // `row-<id>` | "detail"
  const [menuUp, setMenuUp] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

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

  // kebab: one open at a time; Esc / outside click closes
  useEffect(() => {
    if (!openKebab) return;
    const onDoc = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".azone .kebab")) {
        setOpenKebab(null);
        setConfirmCancel(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpenKebab(null);
        setConfirmCancel(false);
      }
    };
    document.addEventListener("click", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [openKebab]);

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

  async function patchStatus(c: Campaign, next: string) {
    setBusy(true);
    setNote("");
    const r = await fetch(`/api/ads/campaigns/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    if (r.ok) {
      const d = (await r.json()) as { campaign: Campaign };
      setSel((cur) => (cur?.id === d.campaign.id ? d.campaign : cur));
      setAll((prev) => prev.map((x) => (x.id === d.campaign.id ? d.campaign : x)));
      setOpenKebab(null);
      setConfirmCancel(false);
    } else {
      setNote("Could not update status — try again.");
      setOpenKebab(null);
    }
    setBusy(false);
  }

  const toggleStatusFor = (c: Campaign) => {
    if (c.source === "demo") return;
    void patchStatus(c, c.status === "ACTIVE" ? "paused" : "active");
  };

  const cancelCampaign = () => {
    if (!sel || sel.source === "demo") return;
    void patchStatus(sel, "cancelled");
  };

  async function copyId(c: Campaign) {
    try {
      await navigator.clipboard.writeText(c.id);
      setCopied(c.id);
      setTimeout(() => setCopied((cur) => (cur === c.id ? null : cur)), 1500);
    } catch {
      setNote("Copy failed — select the ID manually.");
    }
    setOpenKebab(null);
  }

  async function duplicate(c: Campaign) {
    if (c.source === "demo") return;
    setBusy(true);
    const r = await fetch("/api/ads/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `${c.name} (copy)`.slice(0, 80),
        objective: c.objective,
        daily_budget: c.daily_budget,
        destination: c.destination ?? "whatsapp",
        submit: false,
      }),
    });
    setBusy(false);
    setOpenKebab(null);
    if (r.ok) {
      const d = (await r.json()) as { campaign: Campaign };
      await load();
      setStatus("all");
      void pick(d.campaign);
    } else {
      setNote("Could not duplicate — try again.");
    }
  }

  function toggleKebab(key: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (openKebab === key) {
      setOpenKebab(null);
      setConfirmCancel(false);
      return;
    }
    const btn = e.currentTarget as HTMLElement;
    const r = btn.getBoundingClientRect();
    const scroller = btn.closest(".crow") ? document.querySelector(".azone .crows") : null;
    const limit = scroller ? (scroller as HTMLElement).getBoundingClientRect().bottom : window.innerHeight;
    setMenuUp(r.bottom + 230 > limit);
    setConfirmCancel(false);
    setOpenKebab(key);
  }

  const running = sel ? sel.insights.spend > 0 : false;
  const demo = sel?.source === "demo";

  const kebab = (key: string, c: Campaign, triggerTestId: string, menuTestId: string, withCancel = false) => {
    const open = openKebab === key;
    const cDemo = c.source === "demo";
    const canToggle = !cDemo && !busy && c.status !== "IN_REVIEW" && c.status !== "CANCELLED";
    const actionLabel =
      c.status === "ACTIVE" ? "Pause campaign" : c.status === "PAUSED" ? "Resume campaign" : c.status === "DRAFT" ? "Activate campaign" : c.status === "CANCELLED" ? "Cancelled" : "In review";
    return (
      <div className={`kebab${open ? " open" : ""}`}>
        <button
          className="kebab-btn"
          aria-label="Campaign actions"
          data-testid={triggerTestId}
          onClick={(e) => toggleKebab(key, e)}
        >
          <img src={`${P}/dots-three-outline-vertical-bold.svg`} alt="" />
        </button>
        {open && (
          <div className={`kebab-menu${menuUp ? " up" : ""}`} role="menu" data-testid={menuTestId}>
            <button
              className={`kitem${canToggle ? "" : " dis"}`}
              disabled={!canToggle}
              title={cDemo ? "Demo campaigns are read-only (API returns 409)" : c.status === "IN_REVIEW" ? "Under review with Meta" : c.status === "CANCELLED" ? "Cancelled" : undefined}
              data-testid={`menu-toggle-${key}`}
              onClick={(e) => {
                e.stopPropagation();
                if (canToggle) toggleStatusFor(c);
              }}
            >
              <img src={`${P}/${c.status === "ACTIVE" ? "pause" : "play"}-bold.svg`} alt="" />
              {actionLabel}
            </button>
            <button
              className="kitem"
              data-testid={`menu-copy-${key}`}
              onClick={(e) => {
                e.stopPropagation();
                void copyId(c);
              }}
            >
              <img src={`${P}/copy-bold.svg`} alt="" />
              Copy campaign ID
              <span className="khint">{copied === c.id ? "copied" : c.id}</span>
            </button>
            <button
              className={`kitem${cDemo ? " dis" : ""}`}
              disabled={cDemo || busy}
              title={cDemo ? "Demo campaigns are read-only (API returns 409)" : "Creates a draft copy"}
              data-testid={`menu-dup-${key}`}
              onClick={(e) => {
                e.stopPropagation();
                void duplicate(c);
              }}
            >
              <img src={`${P}/files-bold.svg`} alt="" />
              Duplicate
            </button>
            <div className="ksep" />
            <button
              className="kitem"
              data-testid={`menu-perf-${key}`}
              onClick={(e) => {
                e.stopPropagation();
                setOpenKebab(null);
                router.push("/ads/performance");
              }}
            >
              <img src={`${P}/chart-line-up-bold.svg`} alt="" />
              View performance
            </button>
            {withCancel && c.status !== "CANCELLED" && (
              <>
                <div className="ksep" />
                <button
                  className={`kitem danger${confirmCancel ? " armed" : ""}`}
                  disabled={cDemo || busy}
                  title={cDemo ? "Demo campaigns are read-only (API returns 409)" : undefined}
                  data-testid="cancel-campaign"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (cDemo) return;
                    if (confirmCancel) cancelCampaign();
                    else setConfirmCancel(true);
                  }}
                >
                  <img src={`${P}/x-circle-bold.svg`} alt="" />
                  {confirmCancel ? "Tap again to confirm" : c.status === "IN_REVIEW" ? "Cancel review" : "Cancel campaign"}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    );
  };

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
            <span className="badge-mock" style={{ marginLeft: "auto" }} title="Connect a real ad account to go live">Demo data</span>
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
              <span className="dt-ic ads"><img src={`${P}/megaphone-bold.svg`} alt="" /></span>
              <div className="mid">
                <b>{c.name}</b>
                <span className="meta">
                  <span className="obj">{OBJECTIVE_LABELS[c.objective] ?? c.objective}</span>
                  <span className="sep"> · </span>
                  {inr(c.daily_budget)}/day
                </span>
              </div>
              <div className="side">
                <span className={ST_CLASS[c.status]}>{ST_LABEL[c.status]}</span>
                <span className={`spend${c.insights.spend > 0 ? "" : " zero"}`} title={c.insights.spend > 0 ? "Total spend" : "No spend yet"}>
                  {c.insights.spend > 0 ? inr(c.insights.spend) : "—"}
                </span>
              </div>
              {kebab(`row-${c.id}`, c, `kebab-${c.id}`, `kebab-menu-${c.id}`)}
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
                <span>{OBJECTIVE_LABELS[sel.objective] ?? sel.objective} · destination {destLabel(sel.destination) ?? "—"}</span>
              </div>
              <span className={ST_CLASS[sel.status]}>{ST_LABEL[sel.status]}</span>
              <span className="badge-mock">Demo data</span>
              <div className="acts">
                <button
                  className="btn btn-soft btn-sm"
                  disabled={demo || busy}
                  title={demo ? "Demo campaigns are read-only — connect a real ad account" : "Creates a draft copy"}
                  onClick={() => void duplicate(sel)}
                >
                  <img src={`${P}/copy-bold.svg`} alt="" />Duplicate
                </button>
                <button
                  className="btn btn-ads btn-sm"
                  disabled={demo || busy || sel.status === "IN_REVIEW" || sel.status === "CANCELLED"}
                  title={demo ? "Demo campaigns are read-only (API returns 409)" : sel.status === "IN_REVIEW" ? "Under review with Meta" : sel.status === "CANCELLED" ? "Cancelled" : undefined}
                  onClick={() => toggleStatusFor(sel)}
                  data-testid="toggle-status"
                >
                  <img src={`${P}/${sel.status === "ACTIVE" ? "pause" : "play"}-bold.svg`} alt="" />
                  {sel.status === "ACTIVE" ? "Pause campaign" : sel.status === "PAUSED" ? "Resume campaign" : sel.status === "DRAFT" ? "Activate campaign" : sel.status === "CANCELLED" ? "Cancelled" : "In review"}
                </button>
                {/* head kebab lives inside .acts so that on mobile (<640) the
                    actions + kebab always share one flex row — the kebab can
                    never wrap alone (wireframe Rev Nov 1, QA'd at 360-480) */}
                {kebab("detail", sel, "kebab", "cd-menu", true)}
              </div>
            </div>
            <div className="cd-body">
              {note && (
                <div className="cdc-note" data-testid="ads-note">
                  <img src={`${P}/info-bold.svg`} alt="" />
                  {note}
                </div>
              )}
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
                    <div className="well"><div className="k">Impressions</div><div className="v">{num(sel.insights.impressions)}</div></div>
                    <div className="well"><div className="k">Reach</div><div className="v">{num(sel.insights.reach)}</div></div>
                    <div className="well"><div className="k">Clicks</div><div className="v">{num(sel.insights.clicks)}</div></div>
                    <div className="well"><div className="k">Results</div><div className="v">{num(sel.insights.results)}</div></div>
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
                <div className="cdc">
                  <div className="cdc-head">
                    <img src={`${P}/gear-bold.svg`} alt="" />
                    <span className="t">Campaign settings</span>
                  </div>
                  <div className="cdc-body">
                    <div className="slist">
                      <div className="srow"><span className="k">Objective</span><span className="v">{OBJECTIVE_LABELS[sel.objective] ?? sel.objective}</span></div>
                      <div className="srow">
                        <span className="k">Destination</span>
                        <span className="v">
                          {sel.destination === "whatsapp"
                            ? "WhatsApp — NextBiz One"
                            : sel.destination === "website"
                              ? "Website — link clicks to your site"
                              : "Not set"}
                        </span>
                      </div>
                      <div className="srow"><span className="k">Daily budget</span><span className="v">{inr(sel.daily_budget)} / day</span></div>
                      <div className="srow">
                        <span className="k">Schedule</span>
                        <span className="v">{sel.start_time ? `${fmtDate(sel.start_time)} – ${sel.stop_time ? fmtDate(sel.stop_time) : "ongoing"}` : "Starts immediately"}</span>
                      </div>
                      <div className="srow"><span className="k">Source</span><span className="v"><span className="badge-mock">Demo data</span></span></div>
                      <div className="srow"><span className="k">Status</span><span className="v"><span className={ST_CLASS[sel.status]}>{ST_LABEL[sel.status]}</span></span></div>
                    </div>
                  </div>
                  {demo && (
                    <div className="cdc-note">
                      <img src={`${P}/info-bold.svg`} alt="" />
                      Demo rows are read-only — connect a real ad account to go live.
                    </div>
                  )}
                </div>
                <div className="cdc">
                  <div className="cdc-head">
                    <img src={`${P}/stack-bold.svg`} alt="" />
                    <span className="t">Ad sets &amp; ads</span>
                    <span className="ro">Read-only</span>
                  </div>
                  <div className="cdc-body">
                    {demo ? (
                      <>
                        <div className="arow">
                          <span className="dt-ic ads"><img src={`${P}/funnel-bold.svg`} alt="" /></span>
                          <div className="mid"><b>Festive audience — 18-45</b><div className="meta">Ad set · ₹7,110 spend</div></div>
                          <span className="st ok">Active</span>
                        </div>
                        <div className="arow">
                          <span className="dt-ic ads"><img src={`${P}/funnel-bold.svg`} alt="" /></span>
                          <div className="mid"><b>Website visitors</b><div className="meta">Ad set · ₹5,370 spend</div></div>
                          <span className="st ok">Active</span>
                        </div>
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
