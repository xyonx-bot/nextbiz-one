"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Operator console — ported 1:1 from operator-admin/wireframe.html:
 * op-shell (218px tangerine nav) + op-main (op-head) with three stacked
 * op-cards: Pending requests (approve/reject, one decision at a time),
 * Workspaces (revoke/restore, masked numbers), Audit trail (append-only).
 */
type Req = { id: string; business_name: string; use_description: string; email: string; created_at: string };
type Ws = { id: string; name: string; revoked: boolean; created_at: string; contact_count: number; user_count: number };
type Led = { actor_email: string; action: string; target: string; reason: string | null; created_at: string };

const IC = "https://cdn.joyverse.fun/mira-assets/phosphor/bold/";
const when = (ts: string) =>
  new Date(ts).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function OperatorClient({ operator, email }: { operator: string; email: string }) {
  const [reqs, setReqs] = useState<Req[]>([]);
  const [wss, setWss] = useState<Ws[]>([]);
  const [leds, setLeds] = useState<Led[]>([]);
  const [rejectFor, setRejectFor] = useState<Req | null>(null);
  const [reason, setReason] = useState("");
  const [revokeFor, setRevokeFor] = useState<Ws | null>(null);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    const [r, w, l] = await Promise.all([
      fetch("/api/operator/requests").then((x) => x.json()).catch(() => null),
      fetch("/api/operator/workspaces").then((x) => x.json()).catch(() => null),
      fetch("/api/operator/audit").then((x) => x.json()).catch(() => null),
    ]);
    setReqs(r?.requests ?? []);
    setWss(w?.workspaces ?? []);
    setLeds(l?.entries ?? []);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function act(url: string, body: Record<string, unknown>, ok: string) {
    const res = await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await res.json().catch(() => null);
    setNote(d?.ok ? ok : (d?.error ?? "Action failed"));
    if (!d?.ok) return false;
    await load();
    return true;
  }

  const tagMap: Record<string, [string, string]> = {
    request_received: ["Received", "warn"], approved: ["Approved", "ok"],
    rejected: ["Rejected", "warn"], revoked: ["Revoked", "bad"], restored: ["Restored", "ok"],
  };

  return (
    <div className="op-shell" data-testid="operator">
      <nav className="op-nav" aria-label="Operator navigation">
        <div className="op-brand">
          <img src="https://cdn.joyverse.fun/nextbiz-one-transparent.png" alt="" />
          <div className="t"><b>NextBiz One</b><span>Operator</span></div>
        </div>
        <div className="op-item on"><img src={`${IC}user-switch-bold.svg`} alt="" />Requests <span className="n">{reqs.length}</span></div>
        <div className="op-item"><img src={`${IC}users-bold.svg`} alt="" />Workspaces</div>
        <div className="op-item"><img src={`${IC}clipboard-text-bold.svg`} alt="" />Audit trail</div>
        <div className="op-foot"><span className="av">NBS</span>Operator · Kolkata</div>
      </nav>

      <div className="op-main">
        <div className="op-head">
          <div>
            <h1>Access requests</h1>
            <div className="sub">Review who's asking in — approve opens a workspace; reject tells them why.</div>
          </div>
        </div>

        <section className="op-card" aria-label="Pending requests">
          <h2><img src={`${IC}user-switch-bold.svg`} alt="" />Pending requests <span className="chip" style={{ fontSize: "8.5px", padding: "1px 7px" }}>{reqs.length} waiting</span></h2>
          <div className="desc">Newest first · approve/reject notifies the requester by email.</div>
          {reqs.length === 0 && <div className="desc" style={{ padding: "14px 0" }}>Queue is empty — nothing waiting on review.</div>}
          {reqs.map((r) => (
            <div key={r.id} className="rq-row">
              <span className="rq-who"><b>{r.business_name}</b><span>{r.email}</span></span>
              <span className="rq-biz"><b>{r.business_name}</b></span>
              <span className="rq-use">{r.use_description}</span>
              <span className="rq-date">{when(r.created_at)}</span>
              <span className="rq-acts">
                <button className="btn btn-chat" onClick={() => void act(`/api/operator/requests/${r.id}`, { action: "approve" }, `${r.business_name} approved — workspace created.`)} data-testid="approve">
                  <img src={`${IC}check-bold.svg`} alt="" />Approve</button>
                <button className="btn btn-soft" style={{ color: "var(--danger)" }} onClick={() => { setRejectFor(r); setReason(""); }} data-testid="reject-open">
                  <img src={`${IC}x-bold.svg`} alt="" />Reject</button>
              </span>
            </div>
          ))}
          {rejectFor && (
            <div className="rq-row" style={{ gridTemplateColumns: "1fr auto", alignItems: "center", background: "var(--danger-tint)" }}>
              <span className="rq-use"><b>Reject {rejectFor.business_name}?</b> The reason is emailed to them with an edit & re-submit link.
                <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. bulk promotional blasts are outside supported use cases"
                       style={{ width: "100%", marginTop: 6, border: "1px solid var(--line-strong)", borderRadius: "var(--r-sm)", padding: 7, fontSize: 12, background: "var(--surface)", color: "var(--ink)" }} data-testid="reject-reason" /></span>
              <span className="rq-acts">
                <button className="btn btn-soft" onClick={() => setRejectFor(null)}>Cancel</button>
                <button className="btn btn-chat" style={{ background: "var(--danger)" }} disabled={reason.trim().length < 4}
                        onClick={async () => { if (await act(`/api/operator/requests/${rejectFor.id}`, { action: "reject", reason }, "Rejected — requester notified.")) setRejectFor(null); }} data-testid="reject-confirm">Reject</button>
              </span>
            </div>
          )}
        </section>

        <section className="op-card" aria-label="Workspace status">
          <h2><img src={`${IC}users-bold.svg`} alt="" />Workspaces <span className="chip" style={{ fontSize: "8.5px", padding: "1px 7px" }}>{wss.length} total</span></h2>
          <div className="desc">Revoke blocks login + messaging; restore re-enables with same number and history.</div>
          {wss.map((w) => (
            <div key={w.id} className="us-row">
              <span className="us-ppl"><span className="av">{w.name.slice(0, 2).toUpperCase()}</span><span className="t"><b>{w.name}</b><span>created {new Date(w.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span></span></span>
              <span className="us-num">—</span>
              <span className="rq-date">{w.contact_count} contacts</span>
              <span><span className={`st-pill ${w.revoked ? "err" : "on"}`}>{w.revoked ? "Revoked" : "Active"}</span></span>
              <span className="rq-acts">
                {w.revoked
                  ? <button className="btn btn-soft" style={{ color: "var(--chat-deep)" }} onClick={() => void act(`/api/operator/workspaces/${w.id}`, { action: "restore" }, "Workspace restored.")} data-testid="restore">
                      <img src={`${IC}arrow-counter-clockwise-bold.svg`} alt="" />Restore</button>
                  : <button className="btn btn-soft" style={{ color: "var(--danger)" }} onClick={() => { setRevokeFor(w); setReason(""); }} data-testid="revoke-open">
                      <img src={`${IC}prohibit-bold.svg`} alt="" />Revoke</button>}
              </span>
            </div>
          ))}
          {revokeFor && (
            <div className="us-row" style={{ gridTemplateColumns: "1fr auto", alignItems: "center", background: "var(--danger-tint)" }}>
              <span className="rq-use"><b>Revoke {revokeFor.name}?</b> Login + messaging stop instantly. Reason is required (logged permanently).
                <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. policy violation, trial ended"
                       style={{ width: "100%", marginTop: 6, border: "1px solid var(--line-strong)", borderRadius: "var(--r-sm)", padding: 7, fontSize: 12, background: "var(--surface)", color: "var(--ink)" }} data-testid="revoke-reason" /></span>
              <span className="rq-acts">
                <button className="btn btn-soft" onClick={() => setRevokeFor(null)}>Cancel</button>
                <button className="btn btn-chat" style={{ background: "var(--danger)" }} disabled={reason.trim().length < 4}
                        onClick={async () => { if (await act(`/api/operator/workspaces/${revokeFor.id}`, { action: "revoke", reason }, "Workspace revoked.")) setRevokeFor(null); }} data-testid="revoke-confirm">Revoke</button>
              </span>
            </div>
          )}
        </section>

        <section className="op-card" aria-label="Audit trail">
          <h2><img src={`${IC}clipboard-text-bold.svg`} alt="" />Audit trail <span className="chip" style={{ fontSize: "8.5px", padding: "1px 7px" }}>append-only</span></h2>
          <div className="desc">Every operator action is logged permanently — entries can never be edited or removed.</div>
          <div className="led">
            {leds.map((l, i) => {
              const [tag, cls] = tagMap[l.action] ?? [l.action, "warn"];
              return (
                <div className="led-row" key={i}>
                  <span className={`led-dot ${cls}`}><img src={`${IC}${l.action === "approved" || l.action === "restored" ? "check-bold.svg" : l.action === "request_received" ? "envelope-simple-bold.svg" : "prohibit-bold.svg"}`} alt="" /></span>
                  <span className="led-when">{when(l.created_at)}</span>
                  <span className="led-what"><b>{l.target}</b> — {l.action.replace("_", " ")}{l.reason ? ` · reason: ${l.reason}` : ""} <span style={{ color: "var(--ink-3)" }}>({l.actor_email})</span></span>
                  <span className={`led-tag ${cls}`}>{tag}</span>
                </div>
              );
            })}
            {leds.length === 0 && <div className="desc" style={{ padding: "14px 0" }}>Ledger starts with the first request.</div>}
          </div>
        </section>
        {note && <div style={{ position: "fixed", bottom: 18, left: "50%", transform: "translateX(-50%)", background: "var(--card)", border: "1px solid var(--line)", borderRadius: 999, padding: "7px 14px", fontSize: 11, color: "var(--ink)", zIndex: 60 }}>{note}</div>}
      </div>
      <div style={{ display: "none" }}>{operator}{email}</div>
    </div>
  );
}
