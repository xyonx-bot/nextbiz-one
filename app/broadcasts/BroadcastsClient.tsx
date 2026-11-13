"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { avatarClass, fmtPhone, initials } from "@/lib/ui";

/**
 * Broadcasts — design v2 (nextbiz-one-v2/broadcasts): summary tiles · history table · report drawer ·
 * 4-step composer drawer (Audience → Template → Review → Schedule).
 * Hard rules kept from v1: opted-in contacts only, approved templates only (server re-checks both).
 * ?new=1 opens the composer; &to=<contactId,...> preselects contacts (from Inbox / Contacts).
 */
type Bc = { id: string; name: string; status: string; template_name: string; scheduled_at: string | null; sent_at: string | null; total: number; sent: number; failed: number };
type Tpl = { id: string; name: string; status: string; body: string; category?: string };
type Ct = { id: string; wa_id: string; name: string | null; opt_in: boolean };
type Rcpt = { name: string | null; wa_id: string; status: string; sent_at: string | null; error: string | null };
type Roll = Record<string, number>;

const STATUS: Record<string, [string, string, string]> = {
  done: ["ok", "Sent", "megaphone"], sending: ["info", "Sending", "paper-plane-tilt"], scheduled: ["info", "Scheduled", "calendar"],
  draft: ["neutral", "Draft", "note-pencil"], failed: ["bad", "Failed", "warning-circle"],
};
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—");
const dt = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function BroadcastsClient({ startNew = false, preselect = [] }: { startNew?: boolean; preselect?: string[] }) {
  const [list, setList] = useState<Bc[] | null>(null);
  const [tpls, setTpls] = useState<Tpl[]>([]);
  const [anyTpl, setAnyTpl] = useState(false);
  const [contacts, setContacts] = useState<Ct[]>([]);
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Bc | null>(null);
  const [rcpt, setRcpt] = useState<Rcpt[] | null>(null);
  const [roll, setRoll] = useState<Roll>({});
  const [rf, setRf] = useState("all");
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [audMode, setAudMode] = useState<"all" | "contacts">("all");
  const [picked, setPicked] = useState<string[]>([]);
  const [cq, setCq] = useState("");
  const [pickTpl, setPickTpl] = useState<Tpl | null>(null);
  const [name, setName] = useState("");
  const [when, setWhen] = useState("");
  const [schedule, setSchedule] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    const [b, t, c] = await Promise.all([
      fetch("/api/broadcasts", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
      fetch("/api/templates", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
      fetch("/api/contacts", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
    ]);
    setList(b?.broadcasts ?? []);
    setAnyTpl((t?.templates ?? []).length > 0);
    setTpls((t?.templates ?? []).filter((x: Tpl) => x.status === "approved"));
    setContacts(c?.contacts ?? []);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const startCompose = useCallback((ids: string[] = []) => {
    setOpen(true); setStep(1); setAudMode(ids.length ? "contacts" : "all"); setPicked(ids); setCq("");
    setPickTpl(null); setName(""); setWhen(""); setSchedule(false); setNote("");
  }, []);
  useEffect(() => { if (startNew || preselect.length) startCompose(preselect); }, []);

  const openReport = useCallback(async (b: Bc) => {
    setSel(b); setRcpt(null); setRf("all");
    const r = await fetch(`/api/broadcasts/${b.id}/recipients`, { cache: "no-store" }).then((x) => x.json()).catch(() => null);
    setRcpt(r?.recipients ?? []); setRoll(r?.roll ?? {});
  }, []);
  const close = () => { setSel(null); setOpen(false); };
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && close(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, []);

  const optedIn = useMemo(() => contacts.filter((c) => c.opt_in), [contacts]);
  const pickerRows = useMemo(() => {
    const n = cq.trim().toLowerCase();
    return optedIn.filter((c) => !n || (c.name ?? "").toLowerCase().includes(n) || c.wa_id.includes(n));
  }, [optedIn, cq]);
  const audCount = audMode === "all" ? optedIn.length : picked.filter((id) => optedIn.some((c) => c.id === id)).length;
  const canNext = (step === 1 && audCount > 0) || (step === 2 && !!pickTpl) || step === 3;
  const counts = { all: list?.length ?? 0, done: 0, scheduled: 0, draft: 0 } as Record<string, number>;
  for (const b of list ?? []) counts[b.status] = (counts[b.status] ?? 0) + 1;
  const shown = (list ?? []).filter((b) => (filter === "all" || b.status === filter) && (!q || b.name.toLowerCase().includes(q.toLowerCase())));
  const totals = (list ?? []).reduce((a, b) => ({ sent: a.sent + (b.status === "done" ? b.total - b.failed : 0), failed: a.failed + b.failed }), { sent: 0, failed: 0 });
  const rShown = (rcpt ?? []).filter((r) => rf === "all" || (rf === "failed" ? r.status === "failed" : rf === "read" ? r.status === "read" : r.status !== "failed"));
  const pctOf = (v: number) => (roll.total ? Math.round((v / roll.total) * 100) : 0);
  const delivered = (roll.delivered ?? 0) + (roll.read ?? 0);

  async function launch() {
    setBusy(true); setNote("");
    const res = await fetch("/api/broadcasts", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, templateId: pickTpl?.id, audience: { mode: audMode, ...(audMode === "contacts" ? { contactIds: picked } : {}) }, scheduledAt: schedule && when ? new Date(when).toISOString() : null }),
    });
    const d = await res.json().catch(() => null);
    setBusy(false);
    if (d?.ok) { setOpen(false); setNote(schedule && when ? `Scheduled for ${dt(new Date(when).toISOString())} ✓` : "Draft saved — schedule it when you're ready."); await load(); }
    else setNote(d?.error ?? "Couldn't create the broadcast.");
  }

  const preview = pickTpl?.body.replace(/\{\{1\}\}/g, (contacts.find((c) => c.id === picked[0])?.name ?? optedIn[0]?.name ?? "Rahul").split(" ")[0]).replace(/\{\{\d+\}\}/g, "…");

  return (
    <div className="pg-broadcasts">
      <div className="page" data-testid="broadcasts">
        <div className="sum">
          <div className="card"><span className="lbl"><Icon name="paper-plane-tilt" size="sm" />Messages sent</span><span className="val">{totals.sent.toLocaleString("en-IN")}</span><small>across {counts.done ?? 0} sent broadcast{counts.done === 1 ? "" : "s"}</small></div>
          <div className="card"><span className="lbl"><Icon name="warning-circle" size="sm" />Failed</span><span className="val">{totals.failed}</span><small>{totals.failed ? "open a report to see why" : "no delivery failures"}</small></div>
          <div className="card"><span className="lbl"><Icon name="calendar" size="sm" />Scheduled</span><span className="val">{counts.scheduled ?? 0}</span><small>{counts.draft ?? 0} draft{counts.draft === 1 ? "" : "s"} waiting</small></div>
          <div className="card"><span className="lbl"><Icon name="users" size="sm" />Can receive</span><span className="val">{optedIn.length}</span><small>opted-in of {contacts.length} contacts</small></div>
        </div>
        <section className="card lc">
          <div className="tb">
            <div className="chips bpills">
              {(["all", "done", "scheduled", "draft"] as const).map((f) => <button key={f} className={`chip${filter === f ? " on" : ""}`} onClick={() => setFilter(f)}>{f === "all" ? "All" : f === "done" ? "Sent" : (f === "draft" ? "Drafts" : STATUS[f][1])} <span className="n">{counts[f] ?? 0}</span></button>)}
            </div>
            <span className="sp" />
            <label className="search"><Icon name="magnifying-glass" size="sm" /><input placeholder="Search broadcasts" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search broadcasts" /></label>
            <button className="btn btn-primary" onClick={() => startCompose()} data-testid="new-broadcast"><Icon name="plus" />New broadcast</button>
          </div>
          {list && list.length === 0 ? (
            <div className="empty">
              <div className="art"><Icon name="megaphone" /></div><h3>Send your first broadcast</h3>
              <p>Message all your opted-in contacts at once with an approved template — offers, updates, reminders.</p>
              <div className="acts"><button className="btn btn-primary" onClick={() => startCompose()}><Icon name="plus" />New broadcast</button>{tpls.length === 0 && <a className="btn btn-soft" href="/templates?new=1">Create a template first</a>}</div>
            </div>
          ) : (
            <div style={{ padding: "0 8px 8px", overflowX: "auto" }}>
              <table className="dt"><thead><tr><th>Broadcast</th><th className="col-tpl">Template</th><th className="col-aud r">Audience</th><th>Delivery</th><th className="col-date">Date</th><th /></tr></thead>
                <tbody>
                  {list === null && [1, 2, 3].map((k) => <tr key={k}><td colSpan={6}><span className="sk" style={{ display: "block", height: 30 }} /></td></tr>)}
                  {shown.map((b) => {
                    const [pill, label, icon] = STATUS[b.status] ?? ["neutral", b.status, "megaphone"];
                    const ok = b.total ? Math.round(((b.total - b.failed) / b.total) * 100) : 0;
                    return (
                      <tr key={b.id} data-testid="brow" className={sel?.id === b.id ? "on" : ""} onClick={() => void openReport(b)}>
                        <td><div className="row" style={{ gap: 10 }}><span className={`icon-tile sm ${pill === "ok" ? "green" : pill === "info" ? "grape" : pill === "bad" ? "red" : "neutral"}`}><Icon name={icon} /></span><span className="bname"><b>{b.name}</b></span></div></td>
                        <td className="col-tpl"><span className="mono xs">{b.template_name}</span></td>
                        <td className="col-aud r num-c">{b.total}</td>
                        <td>{b.status === "done" ? <><div className="stack"><span style={{ width: `${ok}%` }} /><span style={{ width: 0 }} /><span style={{ width: `${100 - ok}%` }} /></div><div className="rates"><b>{ok}%</b> delivered{b.failed ? ` · ${b.failed} failed` : ""}</div></>
                          : <><span className={`pill ${pill} sm`}>{label}</span><div className="rates">{b.status === "scheduled" && b.scheduled_at ? dt(b.scheduled_at) : b.status === "draft" ? "Not sent" : ""}</div></>}</td>
                        <td className="col-date xs faint" style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{day(b.sent_at ?? b.scheduled_at)}</td>
                        <td className="r"><Icon name="caret-right" style={{ color: "var(--ink-4)" }} /></td>
                      </tr>
                    );
                  })}
                </tbody></table>
            </div>
          )}
        </section>
      </div>

      <div className={`scrim${sel || open ? " open" : ""}`} onClick={close} />
      <aside className={`drawer wide${sel ? " open" : ""}`} aria-label="Broadcast report" aria-hidden={!sel}>
        {sel && (
          <>
            <div className="dh"><span className="icon-tile lg green"><Icon name="megaphone" /></span>
              <div className="grow"><h2>{sel.name}</h2><div className="small muted" style={{ fontWeight: 600 }}>{sel.sent_at ? `Sent ${dt(sel.sent_at)}` : sel.scheduled_at ? `Scheduled ${dt(sel.scheduled_at)}` : "Draft"} · template <span className="mono">{sel.template_name}</span> · {sel.total} recipients</div></div>
              <a className="btn btn-soft btn-sm" href={`/api/broadcasts/${sel.id}/recipients?format=csv`}><Icon name="download-simple" />CSV</a>
              <button className="btn btn-ghost btn-icon" onClick={close} aria-label="Close"><Icon name="x" /></button></div>
            <div className="db">
              <div className="fun">
                <div style={{ ["--w" as string]: "100%" }}><span>Recipients</span><b>{roll.total ?? 0}</b></div>
                <div style={{ ["--w" as string]: `${pctOf(delivered)}%` }}><span>Delivered</span><b>{delivered}</b><small>{pctOf(delivered)}%</small></div>
                <div style={{ ["--w" as string]: `${pctOf(roll.read ?? 0)}%` }}><span>Read</span><b>{roll.read ?? 0}</b><small>{pctOf(roll.read ?? 0)}%</small></div>
                <div style={{ ["--w" as string]: `${pctOf(roll.failed ?? 0)}%` }}><span>Failed</span><b>{roll.failed ?? 0}</b><small>{pctOf(roll.failed ?? 0)}%</small></div>
              </div>
              {(roll.failed ?? 0) > 0 && (
                <div><div className="eyebrow" style={{ marginBottom: 10 }}>Why {roll.failed} didn&apos;t arrive</div><div className="errs">
                  {Object.entries((rcpt ?? []).filter((r) => r.status === "failed").reduce((a, r) => { const k = r.error ?? "Unknown error"; a[k] = (a[k] ?? 0) + 1; return a; }, {} as Record<string, number>)).map(([e, n]) => (
                    <div key={e} className="err"><span className="icon-tile sm red"><Icon name="warning-circle" /></span><span><b>{e.replace(/^\d+ · /, "").replace(/^./, (c) => c.toUpperCase())}</b><small>{/^\d+/.test(e) ? `Meta error ${e.match(/^\d+/)![0]}` : ""}</small></span><span className="n">{n}</span></div>
                  ))}</div></div>
              )}
              <div><div className="row" style={{ marginBottom: 8 }}><span className="eyebrow grow">Recipients</span><div className="seg">{["all", "read", "failed"].map((k) => <button key={k} className={rf === k ? "on" : ""} onClick={() => setRf(k)}>{k[0].toUpperCase() + k.slice(1)}</button>)}</div></div>
                {rcpt === null ? <span className="sk" style={{ display: "block", height: 60 }} /> : rShown.length === 0 ? <p className="xs faint" style={{ fontWeight: 600 }}>{sel.status === "done" ? "No recipients in this view." : "Recipients appear here once it's sent."}</p> : (
                  <table className="dt rtab"><tbody>{rShown.map((r, i) => (
                    <tr key={i}><td><div className="row"><span className={`av xs ${avatarClass(r.wa_id)}`}>{initials(r.name, r.wa_id)}</span>{r.name ?? fmtPhone(r.wa_id)}</div></td>
                      <td><span className={`pill sm ${r.status === "read" ? "info" : r.status === "failed" ? "bad" : r.status === "delivered" ? "ok" : "neutral"}`} title={r.error ?? undefined}>{r.status === "failed" ? "Failed" : r.status[0].toUpperCase() + r.status.slice(1)}</span></td>
                      <td className="faint xs r">{r.sent_at ? dt(r.sent_at) : "—"}</td></tr>))}</tbody></table>
                )}</div>
            </div>
          </>
        )}
      </aside>

      <aside className={`drawer wide${open ? " open" : ""}`} aria-label="New broadcast" aria-hidden={!open}>
        <div className="dh"><span className="icon-tile lg green"><Icon name="megaphone" /></span><div className="grow"><h2>New broadcast</h2><div className="small muted" style={{ fontWeight: 600 }}>Send an approved template to opted-in contacts</div></div><button className="btn btn-ghost btn-icon" onClick={close} aria-label="Close"><Icon name="x" /></button></div>
        <div className="cmp">
          <nav className="steps">
            {["Audience|Who gets it", "Template|Approved only", "Review|Preview & count", "Schedule|Name & time"].map((s, i) => {
              const n = i + 1, [t, sub] = s.split("|");
              return <a key={n} className={`st${step === n ? " on" : step > n ? " done" : ""}`} onClick={() => step > n && setStep(n)}><span className="k">{step > n ? <Icon name="check" size="xs" /> : n}</span><span>{t}<small>{sub}</small></span></a>;
            })}
          </nav>
          <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
            {step === 1 && (
              <div className="sbody on">
                <h3>Who should receive this?</h3>
                <div className="aud">
                  <label className={`aopt${audMode === "all" ? " on" : ""}`} onClick={() => setAudMode("all")} data-testid="aud-mode-all"><span className="radio" /><span><b>All opted-in contacts</b><small>{optedIn.length} people</small></span></label>
                  <label className={`aopt${audMode === "contacts" ? " on" : ""}`} onClick={() => setAudMode("contacts")} data-testid="aud-mode-pick"><span className="radio" /><span><b>Choose contacts</b><small>Pick from your opted-in list</small></span></label>
                </div>
                {audMode === "contacts" && (
                  <div className="col gap-6" data-testid="aud-pick">
                    <div className="row gap-6"><label className="search grow"><Icon name="magnifying-glass" size="sm" /><input placeholder="Search opted-in contacts" value={cq} onChange={(e) => setCq(e.target.value)} aria-label="Search contacts" data-testid="aud-search" /></label>
                      <button className="btn btn-soft btn-sm" onClick={() => setPicked(pickerRows.map((c) => c.id))} data-testid="aud-select-all">Select all</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setPicked([])} data-testid="aud-clear">Clear</button></div>
                    <div className="well" style={{ maxHeight: 240, overflow: "auto", padding: 6 }}>
                      {pickerRows.length === 0 && <p className="xs faint" style={{ padding: 8, fontWeight: 600 }}>No opted-in contacts match.</p>}
                      {pickerRows.map((c) => { const on = picked.includes(c.id); return (
                        <div key={c.id} className={`lrow${on ? " on" : ""}`} onClick={() => setPicked(on ? picked.filter((x) => x !== c.id) : [...picked, c.id])} aria-pressed={on} role="button" data-testid="aud-row" style={{ padding: "7px 8px" }}>
                          <span className={`check${on ? " on" : ""}`} /><span className={`av xs ${avatarClass(c.wa_id)}`}>{initials(c.name, c.wa_id)}</span><span className="grow small" style={{ fontWeight: 600 }}>{c.name ?? fmtPhone(c.wa_id)}</span><span className="xs faint num">{fmtPhone(c.wa_id)}</span></div>); })}
                    </div>
                    <span className="xs faint" style={{ fontWeight: 700 }} data-testid="aud-count">{picked.length} selected</span>
                  </div>
                )}
                <div className="est" data-testid="aud-est"><span className="icon-tile green"><Icon name="users-three" /></span><span><b className="v">{audCount}</b><small>will receive this broadcast</small></span><span className="x">{contacts.length - optedIn.length} not opted in<br />— never included</span></div>
                <div className="note info"><Icon name="shield-check" /><span>NextBiz only sends broadcasts to people who opted in. This protects your number&apos;s quality rating with Meta.</span></div>
              </div>
            )}
            {step === 2 && (
              <div className="sbody on">
                <h3>Pick an approved template</h3>
                {tpls.length === 0 ? (
                  <div className="note warn"><Icon name="info" /><span>{anyTpl ? "No approved templates yet — submit one for review in Templates first." : "You don't have any templates yet."} <a className="btn-link" href="/templates?new=1">Create a template</a></span></div>
                ) : (
                  <div className="col gap-6">{tpls.map((t) => (
                    <label key={t.id} className={`aopt trow${pickTpl?.id === t.id ? " on" : ""}`} onClick={() => setPickTpl(t)} aria-pressed={pickTpl?.id === t.id} data-testid="pick-tpl">
                      <span className="radio" /><span className="grow"><b className="mono">{t.name}</b><small>{t.body.slice(0, 120)}</small></span>{t.category && <span className={`pill sm nodot ${t.category === "MARKETING" ? "info" : "neutral"}`}>{t.category === "MARKETING" ? "Marketing" : "Utility"}</span>}</label>))}</div>
                )}
              </div>
            )}
            {step === 3 && pickTpl && (
              <div className="sbody on">
                <h3>Review</h3>
                <div className="rv" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 16, alignItems: "start" }}>
                  <div className="well" style={{ padding: 16, background: "#EFE7DC", borderRadius: 16 }}>
                    <div style={{ background: "#fff", borderRadius: "2px 12px 12px 12px", padding: "10px 11px", fontSize: 12.5, lineHeight: 1.5, boxShadow: "0 1px 0 rgba(0,0,0,.08)", whiteSpace: "pre-wrap" }}>{preview}</div>
                    <div className="xs faint" style={{ marginTop: 8, fontWeight: 600, textAlign: "center" }}>Preview with the first recipient&apos;s name</div>
                  </div>
                  <div className="col gap-12">
                    <div className="est" data-testid="aud-est"><span className="icon-tile green"><Icon name="users-three" /></span><span><b className="v">{audCount}</b><small>recipients</small></span></div>
                    <div className="col gap-6" style={{ fontSize: "var(--fs-sm)", fontWeight: 600 }}>
                      <div className="row"><Icon name="check-circle-fill" style={{ color: "var(--chat-deep)" }} />Template approved by Meta</div>
                      <div className="row"><Icon name="check-circle-fill" style={{ color: "var(--chat-deep)" }} />Every recipient opted in</div>
                      <div className="row"><Icon name="warning" style={{ color: "var(--banana-deep)" }} />Replies land in your inbox — be ready!</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {step === 4 && (
              <div className="sbody on">
                <h3>Name it and choose when</h3>
                <div className="field"><label htmlFor="bc-name">Broadcast name <span className="opt">only you see this</span></label><input id="bc-name" className="input" placeholder="Diwali offer" value={name} onChange={(e) => setName(e.target.value)} data-testid="bc-name" /></div>
                <div className="aud">
                  <label className={`aopt${!schedule ? " on" : ""}`} onClick={() => setSchedule(false)}><span className="radio" /><span><b>Save as draft</b><small>Schedule it later</small></span></label>
                  <label className={`aopt${schedule ? " on" : ""}`} onClick={() => setSchedule(true)}><span className="radio" /><span><b>Schedule</b><small>Pick a date and time</small></span></label>
                </div>
                {schedule && <div className="field"><label htmlFor="bc-when">Send at (your time)</label><input id="bc-when" className="input" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} style={{ maxWidth: 260 }} data-testid="bc-when" /></div>}
              </div>
            )}
            <div className="cf">
              <button className="btn btn-soft" onClick={() => setStep(Math.max(1, step - 1))} disabled={step === 1}>Back</button><span className="sp" />
              <span className="xs faint" style={{ fontWeight: 600 }}>Step {step} of 4</span>
              {step < 4
                ? <button className="btn btn-primary" disabled={!canNext} onClick={() => setStep(step + 1)} data-testid="bc-next">{step === 3 ? "Next: Schedule" : "Continue"}<Icon name="arrow-right" /></button>
                : <button className="btn btn-primary" disabled={busy || !name.trim() || !pickTpl || (schedule && !when)} onClick={() => void launch()} data-testid="bc-launch"><Icon name={schedule ? "calendar" : "note-pencil"} />{schedule ? `Schedule for ${audCount}` : "Save draft"}</button>}
            </div>
          </div>
        </div>
      </aside>
      {note && <div className="toast" data-testid="bc-note" role="status" style={{ position: "fixed", bottom: 90, left: "50%", transform: "translateX(-50%)", background: "var(--surface)", border: "1px solid var(--line-2)", boxShadow: "var(--shadow-2)", borderRadius: 999, padding: "9px 16px", fontSize: 12, fontWeight: 700, zIndex: 95 }}>{note}</div>}
    </div>
  );
}
