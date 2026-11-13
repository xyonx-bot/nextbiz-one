"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { avatarClass } from "@/lib/ui";

/**
 * Operator console — design v2 (nextbiz-one-v2/operator): its own app with sidebar + topbar.
 * Real data only: pending access requests (approve / reject with reason), workspaces (revoke / restore
 * with reason), append-only audit log (+ CSV). Operators see metadata only — never message content.
 */
type Req = { id: string; business_name: string; use_description: string; email: string; created_at: string };
type Ws = { id: string; name: string; revoked: boolean; created_at: string; contact_count: number; user_count: number };
type Entry = { actor_email: string; action: string; target: string; reason: string | null; created_at: string };
type View = "overview" | "requests" | "workspaces" | "audit";
const TITLES: Record<View, string> = { overview: "Overview", requests: "Access requests", workspaces: "Workspaces", audit: "Audit log" };
const ACTION: Record<string, [string, string, string]> = {
  approved: ["green", "check", "Approved"], rejected: ["neutral", "x", "Rejected"], revoked: ["red", "prohibit", "Revoked"],
  restored: ["green", "arrows-clockwise", "Restored"], request_received: ["orange", "envelope-simple-open", "New request"],
};
const mask = (e: string) => e.replace(/^(.{2}).*(@.*)$/, "$1•••$2");
const ago = (iso: string) => { const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000); if (m < 60) return `${Math.max(1, m)}m ago`; const h = Math.floor(m / 60); if (h < 48) return `${h}h ago`; return `${Math.floor(h / 24)}d ago`; };
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const ini = (s: string) => s.replace(/[^\p{L}\p{N} ]/gu, "").trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?";

export function OperatorClient({ operator, email }: { operator: string; email: string }) {
  const [view, setView] = useState<View>("overview");
  const [reqs, setReqs] = useState<Req[] | null>(null);
  const [wss, setWss] = useState<Ws[] | null>(null);
  const [log, setLog] = useState<Entry[] | null>(null);
  const [selReq, setSelReq] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("We couldn't verify a WhatsApp Business number for this business. Reply with your number and we'll take another look.");
  const [selWs, setSelWs] = useState<Ws | null>(null);
  const [revokeReason, setRevokeReason] = useState("");
  const [wsFilter, setWsFilter] = useState<"all" | "live" | "revoked">("all");
  const [auditFilter, setAuditFilter] = useState("all");
  const [q, setQ] = useState("");
  const [navOpen, setNavOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);
  const [env, setEnv] = useState("Production");
  useEffect(() => { const h = window.location.hostname; setEnv(h.includes("beta") ? "Beta" : /localhost|127\.0\.0\.1/.test(h) ? "Local" : "Production"); }, []);

  const load = useCallback(async () => {
    const [r, w, a] = await Promise.all([
      fetch("/api/operator/requests", { cache: "no-store" }).then((x) => x.json()).catch(() => null),
      fetch("/api/operator/workspaces", { cache: "no-store" }).then((x) => x.json()).catch(() => null),
      fetch("/api/operator/audit", { cache: "no-store" }).then((x) => x.json()).catch(() => null),
    ]);
    setReqs(r?.requests ?? []); setWss(w?.workspaces ?? []); setLog(a?.entries ?? []);
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const go = () => { const h = window.location.hash.slice(1) as View; if (TITLES[h]) setView(h); };
    go(); window.addEventListener("hashchange", go); return () => window.removeEventListener("hashchange", go);
  }, []);
  useEffect(() => { if (note) { const t = setTimeout(() => setNote(null), 4000); return () => clearTimeout(t); } }, [note]);
  useEffect(() => { if (reqs && reqs.length && !reqs.some((r) => r.id === selReq)) setSelReq(reqs[0].id); }, [reqs, selReq]);
  const go = (v: View) => { setView(v); setNavOpen(false); history.replaceState(null, "", `#${v}`); };

  async function decide(id: string, action: "approve" | "reject") {
    setBusy(true);
    const d = await fetch(`/api/operator/requests/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action === "reject" ? { action, reason } : { action }) }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    setNote(d?.ok ? { kind: "ok", text: action === "approve" ? `Approved — workspace “${d.workspace}” is open` : "Request rejected" } : { kind: "bad", text: d?.error ?? "Couldn't save the decision" });
    if (d?.ok) { setRejecting(false); await load(); }
  }
  async function wsAction(w: Ws, action: "revoke" | "restore") {
    setBusy(true);
    const d = await fetch(`/api/operator/workspaces/${w.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action === "revoke" ? { action, reason: revokeReason } : { action }) }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    setNote(d?.ok ? { kind: "ok", text: action === "revoke" ? `${w.name} revoked — sessions ended` : `${w.name} restored` } : { kind: "bad", text: d?.error ?? "Couldn't update the workspace" });
    if (d?.ok) { setSelWs(null); setRevokeReason(""); await load(); }
  }

  const live = (wss ?? []).filter((w) => !w.revoked), revoked = (wss ?? []).filter((w) => w.revoked);
  const oldest = (reqs ?? [])[0];
  const week = (log ?? []).filter((e) => Date.now() - new Date(e.created_at).getTime() < 7 * 86400000);
  const approvedWeek = week.filter((e) => e.action === "approved").length;
  const req = (reqs ?? []).find((r) => r.id === selReq) ?? null;
  const shownWs = useMemo(() => (wss ?? []).filter((w) => (wsFilter === "all" || (wsFilter === "live" ? !w.revoked : w.revoked)) && (!q || w.name.toLowerCase().includes(q.toLowerCase()))), [wss, wsFilter, q]);
  const shownLog = (log ?? []).filter((e) => auditFilter === "all" || e.action === auditFilter);

  return (
    <div className={`pg-op${navOpen ? " nav-open" : ""}`} data-testid="operator">
      <aside className="side op-shell" aria-label="Operator navigation">
        <div className="side-top">
          <div className="brand"><img src="/logo.png" alt="" />NextBiz One<span className="obadge" style={{ marginLeft: "auto" }}><Icon name="shield-check" size="xs" />OPS</span></div>
          <div className="env"><span className="dot" />{env}</div>
        </div>
        <nav className="snav">
          <a className={`ni${view === "overview" ? " on" : ""}`} onClick={() => go("overview")}><Icon name="squares-four" />Overview</a>
          <span className="grp eyebrow">Access</span>
          <a className={`ni${view === "requests" ? " on" : ""}`} onClick={() => go("requests")}><Icon name="envelope-simple-open" />Requests{(reqs?.length ?? 0) > 0 && <span className="badge">{reqs!.length}</span>}</a>
          <a className={`ni${view === "workspaces" ? " on" : ""}`} onClick={() => go("workspaces")}><Icon name="buildings" />Workspaces<span className="badge soft">{live.length}</span></a>
          <span className="grp eyebrow">Records</span>
          <a className={`ni${view === "audit" ? " on" : ""}`} onClick={() => go("audit")}><Icon name="list-checks" />Audit log</a>
        </nav>
        <div className="side-foot">
          <a className="ni" href="/"><Icon name="arrow-left" />Back to app</a>
          <div className="me"><span className="av sm c2">{ini(operator)}</span><span className="grow"><b>{operator}</b><small>{mask(email)}</small></span></div>
        </div>
      </aside>
      <div className={`scrim${navOpen ? " open" : ""}`} onClick={() => setNavOpen(false)} />

      <div className="main op-main">
        <header className="top">
          <button className="btn btn-ghost btn-icon burger" onClick={() => setNavOpen(true)} aria-label="Menu"><Icon name="list" /></button>
          <span className="crumb">Operator<Icon name="caret-right" size="xs" /></span><h1>{TITLES[view]}</h1>
          <div className="acts"><button className="btn btn-ghost btn-icon" onClick={() => void load()} aria-label="Refresh" title="Refresh"><Icon name="arrows-clockwise" /></button></div>
        </header>
        <main className="content">
          {view === "overview" && (
            <section className="view on">
              <div className="vhead"><div className="t"><div className="h1">Hello, {operator.split(" ")[0].replace(/^./, (c) => c.toUpperCase())}</div><p>{live.length} live workspace{live.length === 1 ? "" : "s"} · {reqs?.length ?? 0} request{reqs?.length === 1 ? "" : "s"} waiting.</p></div></div>
              <div className="attn">
                <div className="card at" onClick={() => go("requests")}><span className="icon-tile lg orange"><Icon name="envelope-simple-open" /></span><span><b>{reqs?.length ?? 0} request{reqs?.length === 1 ? "" : "s"} waiting</b><small>{oldest ? `Oldest ${ago(oldest.created_at)}` : "Queue is empty"}</small></span><Icon name="caret-right" size="sm" /></div>
                <div className="card at" onClick={() => go("workspaces")}><span className="icon-tile lg green"><Icon name="buildings" /></span><span><b>{live.length} live workspace{live.length === 1 ? "" : "s"}</b><small>{revoked.length} revoked</small></span><Icon name="caret-right" size="sm" /></div>
                <div className="card at" onClick={() => go("audit")}><span className="icon-tile lg grape"><Icon name="check" /></span><span><b>{approvedWeek} approved this week</b><small>{week.length} logged actions in 7 days</small></span><Icon name="caret-right" size="sm" /></div>
                <div className="card at" onClick={() => go("workspaces")}><span className="icon-tile lg pink"><Icon name="users" /></span><span><b>{(wss ?? []).reduce((s, w) => s + w.contact_count, 0)} contacts</b><small>across all workspaces</small></span><Icon name="caret-right" size="sm" /></div>
              </div>
              <div className="grid">
                <div className="card s7"><div className="card-h"><span className="h3">Waiting for review</span><a className="btn-link" style={{ color: "var(--ads-deep)" }} onClick={() => go("requests")}>Open queue</a></div>
                  <div className="feed">{(reqs ?? []).length === 0 && <p className="xs faint" style={{ padding: 10, fontWeight: 600 }}>No pending requests.</p>}
                    {(reqs ?? []).slice(0, 5).map((r) => <div key={r.id} className="fi" style={{ cursor: "pointer" }} onClick={() => { setSelReq(r.id); go("requests"); }}><span className={`av sm sq ${avatarClass(r.id)}`}>{ini(r.business_name)}</span><span className="grow"><b>{r.business_name}</b><small>{mask(r.email)} · {ago(r.created_at)}</small></span><Icon name="caret-right" style={{ color: "var(--ink-4)" }} /></div>)}</div></div>
                <div className="card s5"><div className="card-h"><span className="h3">Recent activity</span><a className="btn-link" style={{ color: "var(--ads-deep)" }} onClick={() => go("audit")}>Audit log</a></div>
                  <div className="feed">{(log ?? []).length === 0 && <p className="xs faint" style={{ padding: 10, fontWeight: 600 }}>Nothing logged yet.</p>}
                    {(log ?? []).slice(0, 6).map((e, i) => { const [tile, icon, label] = ACTION[e.action] ?? ["neutral", "info", e.action]; return <div key={i} className="fi"><span className={`icon-tile sm ${tile}`}><Icon name={icon} /></span><span className="grow">{label} <b>{e.target}</b><small>{mask(e.actor_email)} · {ago(e.created_at)}</small></span></div>; })}</div></div>
              </div>
            </section>
          )}

          {view === "requests" && (
            <section className="view on fill">
              <div className={`rsplit${req ? " show-det" : ""}`}>
                <div className="card qc">
                  <div className="qh"><span className="h3">Pending <span className="badge" style={{ verticalAlign: 1 }}>{reqs?.length ?? 0}</span></span><span className="xs faint" style={{ fontWeight: 600 }}>Oldest first · target under 24h</span></div>
                  <div className="qlist">
                    {reqs?.length === 0 && <div className="empty"><div className="art"><Icon name="check" /></div><h3>Queue is clear</h3><p>New access requests show up here.</p></div>}
                    {(reqs ?? []).map((r) => (
                      <div key={r.id} className={`qi rq-row${r.id === selReq ? " on" : ""}`} onClick={() => { setSelReq(r.id); setRejecting(false); }}>
                        <span className={`av sq ${avatarClass(r.id)}`}>{ini(r.business_name)}</span>
                        <div className="b"><b><span>{r.business_name}</span><span className={`tm${Date.now() - new Date(r.created_at).getTime() > 86400000 ? " old" : ""}`} style={{ flex: "none" }}>{ago(r.created_at)}</span></b><small>{mask(r.email)}</small></div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className={`card detc${rejecting ? " rejecting" : ""}`}>
                  {!req ? <div className="empty" style={{ flex: 1 }}><p>Select a request.</p></div> : (
                    <>
                      <div className="det-h">
                        <button className="btn btn-ghost btn-icon back" onClick={() => setSelReq(null)} aria-label="Back"><Icon name="arrow-left" /></button>
                        <span className={`av lg sq ${avatarClass(req.id)}`}>{ini(req.business_name)}</span>
                        <div className="grow"><h2>{req.business_name}</h2><div className="sub">Requested {when(req.created_at)} · {ago(req.created_at)}</div></div>
                        <span className="pill warn">Pending review</span>
                      </div>
                      <div className="det-b">
                        <div className="col gap-16">
                          <div className="blk"><span className="eyebrow">Business</span><dl className="kv"><dt>Business name</dt><dd>{req.business_name}</dd><dt>Email</dt><dd>{mask(req.email)}</dd><dt>Submitted</dt><dd>{when(req.created_at)}</dd></dl></div>
                          <div className="blk"><span className="eyebrow">What they want to do</span><div className="quote">“{req.use_description}”</div></div>
                        </div>
                        <div className="col gap-16">
                          <div className="blk"><span className="eyebrow">Checks</span><div className="checks">
                            <div className={`ck ${/@(gmail|yahoo|hotmail|outlook)\./i.test(req.email) ? "warn" : "ok"}`}><Icon name={/@(gmail|yahoo|hotmail|outlook)\./i.test(req.email) ? "warning" : "check-circle-fill"} /><span>{/@(gmail|yahoo|hotmail|outlook)\./i.test(req.email) ? "Personal email" : "Business email domain"}<small>{/@(gmail|yahoo|hotmail|outlook)\./i.test(req.email) ? "Common for small shops — not a blocker" : req.email.split("@")[1]}</small></span></div>
                            <div className={`ck ${req.use_description.length >= 40 ? "ok" : "warn"}`}><Icon name={req.use_description.length >= 40 ? "check-circle-fill" : "warning"} /><span>{req.use_description.length >= 40 ? "Clear use case" : "Short description"}<small>{req.use_description.length} characters</small></span></div>
                            <div className={`ck ${(reqs ?? []).filter((x) => x.email === req.email).length > 1 ? "warn" : "ok"}`}><Icon name={(reqs ?? []).filter((x) => x.email === req.email).length > 1 ? "warning" : "check-circle-fill"} /><span>{(reqs ?? []).filter((x) => x.email === req.email).length > 1 ? "Duplicate request" : "No duplicate requests"}<small>Same email in the queue</small></span></div>
                          </div></div>
                        </div>
                      </div>
                      <div className="det-f"><span className="xs faint" style={{ fontWeight: 600, flex: "1 1 220px" }}>Approving opens their workspace and lets them log in right away.</span>
                        <span className="row gap-6" style={{ marginLeft: "auto" }}>
                          <button className="btn btn-soft" onClick={() => setRejecting(true)} data-testid="reject-open"><Icon name="x" />Reject</button>
                          <button className="btn btn-primary" disabled={busy} onClick={() => void decide(req.id, "approve")} data-testid="approve"><Icon name="check" />Approve</button></span></div>
                      <div className="rejbox"><b className="small">Reject — the requester sees this reason</b>
                        <div className="row wrap gap-6">{["We couldn't verify a WhatsApp Business number for this business. Reply with your number and we'll take another look.", "This use case isn't supported during early access.", "Looks like a duplicate of an earlier request."].map((t, i) => <button key={i} className={`chip${reason === t ? " on" : ""}`} onClick={() => setReason(t)}>{["Can't verify business", "Use case not supported", "Duplicate"][i]}</button>)}</div>
                        <textarea className="textarea" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} data-testid="reject-reason" aria-label="Rejection reason" />
                        <div className="row" style={{ justifyContent: "flex-end" }}><button className="btn btn-soft" onClick={() => setRejecting(false)}>Cancel</button><button className="btn btn-danger" disabled={busy || reason.trim().length < 4} onClick={() => void decide(req.id, "reject")} data-testid="reject-confirm">Reject request</button></div></div>
                    </>
                  )}
                </div>
              </div>
            </section>
          )}

          {view === "workspaces" && (
            <section className="view on">
              <div className="card">
                <div className="tb"><div className="chips">{(["all", "live", "revoked"] as const).map((f) => <button key={f} className={`chip${wsFilter === f ? " on" : ""}`} onClick={() => setWsFilter(f)}>{f === "all" ? "All" : f === "live" ? "Live" : "Revoked"} <span className="n">{f === "all" ? wss?.length ?? 0 : f === "live" ? live.length : revoked.length}</span></button>)}</div>
                  <span className="sp" /><label className="search"><Icon name="magnifying-glass" size="sm" /><input placeholder="Search workspaces" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search workspaces" /></label></div>
                <div style={{ padding: "0 8px 8px", overflowX: "auto" }}><table className="dt"><thead><tr><th>Workspace</th><th>Status</th><th className="col-y r">Contacts</th><th className="col-x r">Users</th><th className="col-y">Created</th><th /></tr></thead>
                  <tbody>{shownWs.map((w) => (
                    <tr key={w.id} onClick={() => setSelWs(w)} className={selWs?.id === w.id ? "on" : ""}>
                      <td><div className="row" style={{ gap: 10 }}><span className={`av sm sq ${avatarClass(w.id)}`}>{ini(w.name)}</span><span className="wsn"><b>{w.name}</b></span></div></td>
                      <td><span className={`pill sm ${w.revoked ? "bad" : "ok"}`}>{w.revoked ? "Revoked" : "Live"}</span></td>
                      <td className="col-y r num">{w.contact_count}</td><td className="col-x r num">{w.user_count}</td>
                      <td className="col-y xs faint" style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{when(w.created_at)}</td>
                      <td className="r"><Icon name="caret-right" style={{ color: "var(--ink-4)" }} /></td></tr>))}</tbody></table></div>
              </div>
              <div className="note"><Icon name="shield-check" /><span>Operators see workspace metadata and totals only. Message content, contact names and customer numbers are never shown here.</span></div>
            </section>
          )}

          {view === "audit" && (
            <section className="view on">
              <div className="card">
                <div className="tb"><div className="chips">{["all", "request_received", "approved", "rejected", "revoked", "restored"].map((f) => <button key={f} className={`chip${auditFilter === f ? " on" : ""}`} onClick={() => setAuditFilter(f)}>{f === "all" ? "All" : ACTION[f]?.[2] ?? f}</button>)}</div>
                  <span className="sp" /><span className="pill neutral sm nodot"><Icon name="lock" size="xs" />Append-only</span><a className="btn btn-soft btn-sm" href="/api/operator/audit?format=csv"><Icon name="download-simple" />Export CSV</a></div>
                <div style={{ padding: "0 8px 8px", overflowX: "auto" }}><table className="dt lg"><thead><tr><th>When</th><th>Event</th><th className="col-y">Actor</th><th className="col-x">Reason</th></tr></thead>
                  <tbody>{shownLog.length === 0 && <tr><td colSpan={4}><div className="empty"><p>No entries.</p></div></td></tr>}
                    {shownLog.map((e, i) => { const [tile, icon, label] = ACTION[e.action] ?? ["neutral", "info", e.action]; return (
                      <tr key={i}><td><time>{when(e.created_at)}</time></td><td><div className="row led-what" style={{ gap: 10 }}><span className={`icon-tile sm ${tile}`}><Icon name={icon} /></span><span>{label} · <b>{e.target}</b></span></div></td>
                        <td className="col-y small muted" style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{mask(e.actor_email)}</td><td className="col-x xs muted">{e.reason ?? "—"}</td></tr>); })}</tbody></table></div>
              </div>
            </section>
          )}
        </main>
      </div>

      <div className={`scrim${selWs ? " open" : ""}`} onClick={() => setSelWs(null)} />
      <aside className={`drawer${selWs ? " open" : ""}`} aria-label="Workspace details" aria-hidden={!selWs}>
        {selWs && (
          <>
            <div className="dh"><span className={`av lg sq ${avatarClass(selWs.id)}`}>{ini(selWs.name)}</span><div className="grow"><h2>{selWs.name}</h2><div className="small muted" style={{ fontWeight: 600 }}>Created {when(selWs.created_at)}</div></div><button className="btn btn-ghost btn-icon" onClick={() => setSelWs(null)} aria-label="Close"><Icon name="x" /></button></div>
            <div className="db">
              <div className="mini"><div><span>Status</span><b>{selWs.revoked ? "Revoked" : "Live"}</b></div><div><span>Contacts</span><b>{selWs.contact_count}</b></div><div><span>Users</span><b>{selWs.user_count}</b></div></div>
              <div className="note"><Icon name="shield-check" /><span>No access to this workspace&apos;s messages or contacts.</span></div>
              {!selWs.revoked && (
                <div className="field"><label htmlFor="revoke-reason">Reason for revoking <span className="opt">logged and required</span></label><textarea id="revoke-reason" className="textarea" rows={2} value={revokeReason} onChange={(e) => setRevokeReason(e.target.value)} placeholder="e.g. spam reports from customers" data-testid="revoke-reason" /><span className="hint">Revoking ends their sessions now and blocks messaging until restored.</span></div>
              )}
            </div>
            <div className="card-f"><span className="sp" />
              {selWs.revoked ? <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => void wsAction(selWs, "restore")} data-testid="restore"><Icon name="arrows-clockwise" />Restore access</button>
                : <button className="btn btn-danger btn-sm" disabled={busy || revokeReason.trim().length < 4} onClick={() => void wsAction(selWs, "revoke")} data-testid="revoke-confirm"><Icon name="prohibit" />Revoke access</button>}
            </div>
          </>
        )}
      </aside>
      {note && <div role="status" style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "var(--surface)", border: `1px solid ${note.kind === "ok" ? "var(--chat-line)" : "var(--danger-line)"}`, color: note.kind === "ok" ? "var(--chat-deep)" : "var(--danger-deep)", boxShadow: "var(--shadow-2)", borderRadius: 999, padding: "9px 16px", fontSize: 12, fontWeight: 700, zIndex: 95 }}>{note.text}</div>}
    </div>
  );
}
