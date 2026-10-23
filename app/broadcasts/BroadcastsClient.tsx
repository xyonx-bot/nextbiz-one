"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * Broadcasts — ported 1:1 from broadcasts/wireframe.html v1:
 * blist (pills + search + brows), bdetail (rstats + rtable report + CSV),
 * bcomposer (4 steps: Audience → Template → Preview → Schedule, phone preview).
 * Opt-in is a hard rule everywhere; approved templates only.
 */
type Bc = {
  id: string; name: string; status: string; template_name: string;
  scheduled_at: string | null; sent_at: string | null;
  total: number; sent: number; failed: number;
};
type Tpl = { id: string; name: string; status: string; body: string };
type Rcpt = {
  first_name: string | null; last_name: string | null; wa_id: string;
  status: string; sent_at: string | null; error: string | null;
};
type Roll = Record<string, number>;

const IC = {
  ok: "https://cdn.joyverse.fun/mira-assets/phosphor/bold/check-circle-bold.svg",
  sched: "https://cdn.joyverse.fun/mira-assets/phosphor/bold/calendar-bold.svg",
  draft: "https://cdn.joyverse.fun/mira-assets/phosphor/bold/files-bold.svg",
  fail: "https://cdn.joyverse.fun/mira-assets/phosphor/bold/warning-circle-bold.svg",
  x: "https://cdn.joyverse.fun/mira-assets/phosphor/bold/x-bold.svg",
  back: "https://cdn.joyverse.fun/mira-assets/phosphor/bold/arrow-left-bold.svg",
  search: "https://cdn.joyverse.fun/mira-assets/phosphor/bold/magnifying-glass-bold.svg",
  users: "https://cdn.joyverse.fun/mira-assets/phosphor/bold/users-bold.svg",
  clock: "https://cdn.joyverse.fun/mira-assets/phosphor/bold/clock-bold.svg",
  dl: "https://cdn.joyverse.fun/mira-assets/phosphor/bold/download-simple-bold.svg",
  send: "https://cdn.joyverse.fun/mira-assets/phosphor/bold/paper-plane-tilt-bold.svg",
};

function fmtWhen(b: Bc): string {
  if (b.sent_at) return new Date(b.sent_at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (b.scheduled_at) return new Date(b.scheduled_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return "—";
}
function stp(b: Bc) {
  const deliv = b.total ? Math.round(((b.total - b.failed) / b.total) * 100) : 0;
  if (b.status === "done" && b.failed > 0) return <span className="stp part">{deliv}% delivered</span>;
  if (b.status === "done") return <span className="stp ok">100% delivered</span>;
  if (b.status === "scheduled") return <span className="stp sched">Scheduled</span>;
  if (b.status === "failed") return <span className="stp fail">Failed</span>;
  if (b.status === "sending") return <span className="stp sched">Sending…</span>;
  return <span className="stp draft">{b.total ? `${b.total} recipients` : "audience not set"}</span>;
}
function icCls(b: Bc) {
  if (b.status === "failed") return "ic fail";
  if (b.status === "scheduled" || b.status === "draft") return "ic sched";
  return "ic";
}

export function BroadcastsClient() {
  const [list, setList] = useState<Bc[]>([]);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Bc | null>(null);
  const [rcpt, setRcpt] = useState<Rcpt[]>([]);
  const [roll, setRoll] = useState<Roll>({});
  const [open, setOpen] = useState(false);          // composer slide-over
  const [step, setStep] = useState(1);
  const [optIn, setOptIn] = useState(0);
  const [tpls, setTpls] = useState<Tpl[]>([]);
  const [pickTpl, setPickTpl] = useState<Tpl | null>(null);
  const [name, setName] = useState("");
  const [when, setWhen] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    const [b, t] = await Promise.all([
      fetch("/api/broadcasts").then((r) => r.json()).catch(() => null),
      fetch("/api/templates").then((r) => r.json()).catch(() => null),
    ]);
    setList(b?.broadcasts ?? []);
    const approved = (t?.templates ?? []).filter((x: Tpl) => x.status === "approved");
    setTpls(approved);
    if (approved.length === 0 && (t?.templates ?? []).length > 0) {
      setNote("No approved templates yet — submit one for approval in Templates first.");
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const openDetail = useCallback(async (b: Bc) => {
    setSel(b);
    const r = await fetch(`/api/broadcasts/${b.id}/recipients`).then((x) => x.json()).catch(() => null);
    setRcpt(r?.recipients ?? []);
    setRoll(r?.roll ?? {});
  }, []);

  async function launch(schedule: boolean) {
    setBusy(true); setNote("");
    const res = await fetch("/api/broadcasts", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name, templateId: pickTpl?.id,
        scheduledAt: schedule && when ? new Date(when).toISOString() : null,
      }),
    });
    const d = await res.json().catch(() => null);
    setBusy(false);
    if (d?.ok) {
      setOpen(false); setStep(1); setPickTpl(null); setName(""); setWhen("");
      setNote(schedule ? "Scheduled ✓" : "Draft saved — schedule it when ready.");
      await load();
    } else setNote(d?.error ?? "Couldn't create the broadcast.");
  }

  useEffect(() => {
    if (!open) return;
    if (step === 1 && optIn === 0) {
      void fetch("/api/contacts").then((r) => r.json()).then((d) => {
        setOptIn((d?.contacts ?? []).filter((c: { opt_in?: boolean }) => c.opt_in).length);
      }).catch(() => {});
    }
  }, [open, step, optIn]);

  // 1:1 with the wireframe CSS: .show-detail / .composer-open body states
  useEffect(() => {
    document.body.classList.toggle("show-detail", !!sel);
    return () => document.body.classList.remove("show-detail");
  }, [sel]);
  useEffect(() => {
    document.body.classList.toggle("composer-open", open);
    return () => document.body.classList.remove("composer-open");
  }, [open]);

  const counts = useMemo(() => ({
    all: list.length,
    delivered: list.filter((b) => b.status === "done").length,
    sched: list.filter((b) => b.status === "scheduled").length,
    draft: list.filter((b) => b.status === "draft").length,
  }), [list]);
  const shown = list.filter((b) => !q || b.name.toLowerCase().includes(q.toLowerCase()));
  const canNext = (step === 1 && optIn > 0) || (step === 2 && pickTpl) || (step === 3 && name.trim());

  return (
    <div className="bzone" data-testid="broadcasts">
      <section className="blist" aria-label="Broadcasts">
        <div className="blist-head">
          <div className="bpills">
            <span className="chip on">All <span className="n">{counts.all}</span></span>
            <span className="chip">Delivered <span className="n">{counts.delivered}</span></span>
            <span className="chip">Scheduled <span className="n">{counts.sched}</span></span>
            <span className="chip">Drafts <span className="n">{counts.draft}</span></span>
          </div>
          <div className="bsearch">
            <img src={IC.search} alt="" />
            <input placeholder="Search broadcasts…" value={q} onChange={(e) => setQ(e.target.value)}
                   style={{ border: 0, outline: "none", background: "transparent", flex: 1, fontSize: "11.5px", color: "var(--ink)" }} />
            <button className="btn btn-primary" style={{ minHeight: 26, padding: "0 9px", fontSize: "10px" }}
                    onClick={() => { setOpen(true); setStep(1); }} data-testid="new-broadcast">
              <img src={IC.send} alt="" style={{ width: 12, height: 12 }} />New broadcast</button>
          </div>
        </div>
        <div className="brows">
          {shown.length === 0 && (
            <div style={{ padding: "20px 14px", color: "var(--ink-3)", fontSize: "11px" }}>
              No broadcasts yet — start one with “New broadcast”.
            </div>
          )}
          {shown.map((b) => (
            <div key={b.id} className={`brow${sel?.id === b.id ? " on" : ""}`} data-testid="brow"
                 onClick={() => void openDetail(b)}>
              <div className={icCls(b)}><img src={b.status === "failed" ? IC.fail : b.status === "draft" ? IC.draft : b.status === "scheduled" ? IC.sched : IC.ok} alt="" /></div>
              <div className="t">
                <div className="r1"><b>{b.name}</b><span className="when">{fmtWhen(b)}</span></div>
                <div className="r2"><span className="meta">{b.template_name} · {b.total} recipients</span>{stp(b)}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className={`bdetail${sel ? " show" : ""}`} aria-label="Broadcast report">
        {!sel ? (
          <div style={{ display: "grid", placeItems: "center", height: "100%", color: "var(--ink-3)", fontSize: "11.5px", padding: 20 }}>
            Pick a broadcast to see its delivery report.
          </div>
        ) : (
          <>
            <div className="bd-head">
              <button className="back" onClick={() => setSel(null)} aria-label="Back"><img src={IC.back} alt="" /></button>
              <div className="t">
                <b>{sel.name}</b>
                <span>{sel.template_name} · {sel.status === "scheduled" ? `scheduled ${fmtWhen(sel)}` : sel.sent_at ? `sent ${new Date(sel.sent_at).toLocaleString()}` : sel.status} · {sel.total} recipients</span>
              </div>
              <div className="acts">
                <a className="btn btn-soft" style={{ minHeight: 28, padding: "0 10px", fontSize: 10, display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none" }}
                   href={`/api/broadcasts/${sel.id}/recipients?format=csv`}>
                  <img src={IC.dl} alt="" style={{ width: 12, height: 12 }} />Export CSV</a>
              </div>
            </div>
            <div className="bd-body">
              <div className="rstats">
                <div className={`rstat${roll.failed ? " fail" : ""}`}><div className="k">Delivered</div><div className="v">{roll.delivered ?? 0}</div></div>
                <div className="rstat"><div className="k">Sent</div><div className="v">{roll.sent ?? 0}</div></div>
                <div className={`rstat${roll.failed ? " fail" : ""}`}><div className="k">Failed</div><div className="v">{roll.failed ?? 0}</div></div>
                <div className="rstat"><div className="k">Read</div><div className="v">{roll.read ?? 0}</div></div>
              </div>
              <div className="psec">
                <div className="st" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span className="mlab">Recipients</span>
                </div>
                <div className="rtable">
                  <div className="rth"><span>Contact</span><span>Status</span><span>Time</span><span>Error</span></div>
                  {rcpt.length === 0 && <div className="rr"><span>—</span><span>—</span><span>—</span><span>—</span></div>}
                  {rcpt.map((r, i) => (
                    <div className="rr" key={i}>
                      <span><b>{`${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() || "Contact"}</b> <span className="num">{r.wa_id}</span></span>
                      <span className="st-wrap"><span className={`st ${r.status === "delivered" || r.status === "read" ? "ok" : r.status === "failed" ? "fail" : ""}`}>{r.status.charAt(0).toUpperCase() + r.status.slice(1)}</span></span>
                      <span className="num">{r.sent_at ? new Date(r.sent_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "—"}</span>
                      <span className="st-wrap">{r.error && <span className="err">{r.error}</span>}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </section>

      <div className={`bcomposer${open ? " open" : ""}`} aria-label="New broadcast">
        <div className="bc-head">
          <b>New broadcast</b>
          <button className="iconbtn x" onClick={() => setOpen(false)} aria-label="Close"><img src={IC.x} alt="" /></button>
        </div>
        <div className="steps">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className={`step${step === n ? " on" : step > n ? " done" : ""}`} onClick={() => step > n && setStep(n)}>
              <span className="dot">{n}</span><span className="nm">{["Audience", "Template", "Preview", "Schedule"][n - 1]}</span>
            </div>
          ))}
        </div>
        <div className="bc-body">
          {step === 1 && (
            <div className="aud-est">
              <span className="v">{optIn}</span>
              <span className="k">recipients — opted-in only<br/>these contacts said yes to marketing</span>
              <img src={IC.users} alt="" />
            </div>
          )}
          {step === 2 && (
            <div style={{ display: "grid", gap: 8 }}>
              {tpls.length === 0 && <div style={{ color: "var(--ink-3)", fontSize: 11.5 }}>No approved templates — get one approved in Templates first.</div>}
              {tpls.map((t) => (
                <button key={t.id} onClick={() => setPickTpl(t)} className="trow" style={{ textAlign: "left", cursor: "pointer" }}
                        data-testid="pick-tpl">
                  <div className="r1"><b>{t.name}</b><span className="st ok">Approved</span></div>
                  <div className="r2" style={{ fontSize: 10.5, color: "var(--ink-3)" }}>{t.body.slice(0, 60)}…</div>
                </button>
              ))}
            </div>
          )}
          {step === 3 && pickTpl && (
            <>
              <div className="aud-est">
                <span className="v">{optIn}</span>
                <span className="k">recipients — opted-in · sample preview below</span>
                <img src={IC.users} alt="" />
              </div>
              <div style={{ display: "grid", placeItems: "center", background: "var(--bg)", border: "1px dashed var(--line-strong)", borderRadius: "var(--r-md)", padding: "18px 0" }}>
                <div className="phone" style={{ maxWidth: 210 }}>
                  <div className="notch"></div>
                  <div className="screen" style={{ minHeight: 330 }}>
                    <div className="wabar">
                      <img className="back" src={IC.back} alt="" />
                      <div className="pa">NB</div>
                      <div className="pn"><b>NextBiz Studio</b><small>online</small></div>
                    </div>
                    <div className="pchat">
                      <div className="pdate"><span>Today</span></div>
                      <div className="pmsg">
                        {pickTpl.body.replace(/\{\{1\}\}/g, "there")}
                        <span className="pmeta">{new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
                      </div>
                    </div>
                    <div className="homebar"></div>
                  </div>
                </div>
              </div>
            </>
          )}
          {step === 4 && (
            <div style={{ display: "grid", gap: 10 }}>
              <label style={{ fontSize: 10, color: "var(--ink-3)" }}>Broadcast name
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Diwali offer — existing customers"
                       style={{ width: "100%", border: "1px solid var(--line)", borderRadius: "var(--r-sm)", padding: 8, fontSize: 12, background: "var(--surface)", color: "var(--ink)", marginTop: 4 }} data-testid="bc-name" />
              </label>
              <label style={{ fontSize: 10, color: "var(--ink-3)" }}>Schedule (leave empty to save as draft)
                <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)}
                       style={{ width: "100%", border: "1px solid var(--line)", borderRadius: "var(--r-sm)", padding: 8, fontSize: 12, background: "var(--surface)", color: "var(--ink)", marginTop: 4 }} />
              </label>
            </div>
          )}
        </div>
        <div className="bc-foot">
          <button className="btn btn-soft" onClick={() => setStep(Math.max(1, step - 1))} style={{ opacity: step === 1 ? 0.4 : 1 }}>
            <img src={IC.back} alt="" />Back</button>
          {step < 4
            ? <button className="btn btn-primary" disabled={!canNext} onClick={() => setStep(step + 1)} data-testid="bc-next">
                <img src={IC.clock} alt="" />Next: {["Template", "Preview", "Schedule"][step - 1]}</button>
            : <button className="btn btn-primary" disabled={busy || !name.trim() || !pickTpl} onClick={() => void launch(!!when)} data-testid="bc-launch">
                <img src={IC.send} alt="" />{when ? "Schedule broadcast" : "Save draft"}</button>}
        </div>
      </div>
      {note && <div data-testid="bc-note" style={{ position: "fixed", bottom: 18, left: "50%", transform: "translateX(-50%)", background: "var(--card)", border: "1px solid var(--line)", borderRadius: 999, padding: "7px 14px", fontSize: 11, color: "var(--ink)", zIndex: 60 }}>{note}</div>}
    </div>
  );
}
