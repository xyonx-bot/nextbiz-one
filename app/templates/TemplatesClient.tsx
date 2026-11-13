"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/Icon";

/**
 * Templates — design v2 (nextbiz-one-v2/templates): list | sectioned editor | phone preview.
 * Status banner per Meta review state (approved / in review / rejected + reason / draft).
 * Backend supports: create (draft or submit), edit name + body on drafts/rejected, submit, duplicate,
 * sync statuses from Meta. Category/language are fixed after creation (Meta requires a new template).
 */
type Tpl = {
  id: string; name: string; meta_name: string | null; category: string; language: string; body: string;
  variables: string[] | null; status: string; rejection_reason: string | null; updated_at: string;
  header?: string | null; buttons?: string | null; footer?: string | null;
};
const PILL: Record<string, [string, string]> = { approved: ["ok", "Approved"], pending: ["warn", "In review"], rejected: ["bad", "Rejected"], draft: ["neutral", "Draft"] };
const LANGS: Record<string, string> = { en_IN: "English (India)", en_US: "English (US)", en: "English", hi: "Hindi", bn: "Bengali" };
const SAMPLE: Record<string, string> = { "1": "Rahul", "2": "Nov 21", "3": "Acme Studio" };
const tokensOf = (b: string) => [...new Set(b.match(/\{\{\d+\}\}/g) ?? [])].map((t) => t.replace(/\D/g, "")).sort();
const ago = (iso: string) => { const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000); return m < 60 ? `${Math.max(1, m)} min ago` : m < 2880 ? `${Math.floor(m / 60)}h ago` : new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }); };

function Phone({ t, body, samples }: { t: Pick<Tpl, "header" | "footer" | "buttons">; body: string; samples: Record<string, string> }) {
  const parts = body.split(/(\{\{\d+\}\})/g);
  const btns = (t.buttons ?? "").split(/\n|\|/).map((s) => s.trim()).filter(Boolean);
  return (
    <div className="phone"><div className="scr">
      <div className="sbar"><span>9:41</span><span>●●● ▮</span></div>
      <div className="wah"><Icon name="arrow-left" /><span className="av"><img src="/logo.png" alt="" /></span><span><b>Your business</b><small>Business account</small></span></div>
      <div className="wab"><span className="d">TODAY</span>
        <div className="wbub">
          {t.header && <div className="hd">{t.header}</div>}
          <div className="bd" data-testid="tpl-preview-body">{parts.map((p, i) => { const m = p.match(/^\{\{(\d+)\}\}$/); return m ? <b key={i}>{samples[m[1]] || SAMPLE[m[1]] || p}</b> : <span key={i}>{p}</span>; })}</div>
          <div className="ft"><span>{t.footer ?? ""}</span><span>11:02</span></div>
          {btns.map((b) => <div key={b} className="bt">{b}</div>)}
        </div>
      </div>
    </div></div>
  );
}

export function TemplatesClient({ startNew = false }: { startNew?: boolean }) {
  const [list, setList] = useState<Tpl[] | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const [creating, setCreating] = useState(startNew);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [cat, setCat] = useState<"MARKETING" | "UTILITY">("MARKETING");
  const [lang, setLang] = useState("en_IN");
  const [samples, setSamples] = useState<Record<string, string>>({});
  const [viewEd, setViewEd] = useState(false);
  const [showPv, setShowPv] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/templates", { cache: "no-store" });
    const data = (await res.json().catch(() => null)) as { templates?: Tpl[] } | null;
    setList(data?.templates ?? []);
    return data?.templates ?? [];
  }, []);
  useEffect(() => { void load().then((l) => { if (!startNew && l.length && window.matchMedia("(min-width: 768px)").matches) setSelId(l[0].id); }); }, [load, startNew]);

  const sel = creating ? null : list?.find((t) => t.id === selId) ?? null;
  useEffect(() => { if (sel) { setName(sel.name); setBody(sel.body); setNote(null); } }, [sel?.id]);
  const startCreate = () => { setCreating(true); setSelId(null); setName(""); setBody(""); setCat("MARKETING"); setLang("en_IN"); setNote(null); setViewEd(true); };
  useEffect(() => {
    const h = () => startCreate();
    window.addEventListener("nbo:new-template", h); return () => window.removeEventListener("nbo:new-template", h);
  }, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: list?.length ?? 0, approved: 0, pending: 0, rejected: 0, draft: 0 };
    for (const t of list ?? []) c[t.status] = (c[t.status] ?? 0) + 1;
    return c;
  }, [list]);
  const shown = (list ?? []).filter((t) => (filter === "all" || t.status === filter) && (!q || t.name.toLowerCase().includes(q.toLowerCase())));
  const status = creating ? "draft" : sel?.status ?? "draft";
  const editable = creating || status === "draft" || status === "rejected";
  const vars = tokensOf(body);
  const nameOk = /^[a-z0-9_]{3,64}$/.test(name);
  const dirty = !!sel && (name !== sel.name || body !== sel.body);

  async function act(fn: () => Promise<Response>, okText: string, after?: (d: { template?: Tpl }) => void) {
    setBusy(true); setNote(null);
    try {
      const res = await fn();
      const d = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; template?: Tpl; updated?: number } | null;
      if (!res.ok || !d?.ok) setNote({ kind: "bad", text: d?.error ?? "Something went wrong — try again." });
      else { setNote({ kind: "ok", text: okText.replace("{n}", String(d.updated ?? 0)) }); await load(); after?.(d); }
    } finally { setBusy(false); }
  }
  const json = (method: string, url: string, b?: unknown) => fetch(url, { method, headers: { "Content-Type": "application/json" }, body: b ? JSON.stringify(b) : undefined });
  const create = (submit: boolean) => act(() => json("POST", "/api/templates", { name, category: cat, language: lang, body, variables: vars.map((n) => samples[n] || SAMPLE[n] || `variable ${n}`), submit }),
    submit ? "Submitted to Meta — most reviews finish within an hour." : "Draft saved.", (d) => { setCreating(false); if (d.template) setSelId(d.template.id); });
  const save = () => sel && act(() => json("PATCH", `/api/templates/${sel.id}`, { name, body }), "Changes saved.");
  const submit = () => sel && act(async () => { if (dirty) await json("PATCH", `/api/templates/${sel.id}`, { name, body }); return json("PATCH", `/api/templates/${sel.id}`, { action: "submit" }); }, "Submitted to Meta — most reviews finish within an hour.");
  const duplicate = () => sel && act(() => json("PATCH", `/api/templates/${sel.id}`, { action: "duplicate" }), "Copied as a new draft.", (d) => d.template && setSelId(d.template.id));
  const sync = () => act(() => fetch("/api/templates/refresh", { method: "POST" }), "Synced with Meta — {n} updated.");
  function insertVar() {
    const el = bodyRef.current; const nextN = String((vars.map(Number).sort((a, b) => b - a)[0] ?? 0) + 1); const tok = `{{${nextN}}}`;
    const s = el?.selectionStart ?? body.length, e = el?.selectionEnd ?? body.length;
    setBody(body.slice(0, s) + tok + body.slice(e));
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(s + tok.length, s + tok.length); });
  }
  const preview = <Phone t={sel ?? {}} body={body} samples={samples} />;
  const pvMeta = (
    <div className="pv-meta">
      <div className="row"><span>Category</span><span className={`pill sm nodot ${cat === "MARKETING" || sel?.category === "MARKETING" ? "info" : "neutral"}`}>{(sel?.category ?? cat) === "MARKETING" ? "Marketing" : "Utility"}</span></div>
      <div className="row"><span>Can send to</span><span style={{ color: "var(--ink)" }}>{(sel?.category ?? cat) === "MARKETING" ? "Opted-in contacts only" : "Customers with an order or account"}</span></div>
    </div>
  );

  return (
    <div className="pg-templates" style={{ height: "100%" }}>
      <div className={`tp${viewEd ? " view-ed" : ""}${showPv ? " show-pv" : ""}`} data-data={list && list.length === 0 && !creating ? "empty" : "full"} data-testid="templates">
        <section className="card lcard">
          <div className="lh">
            <div className="chips">
              {(["all", "approved", "pending", "rejected", "draft"] as const).map((f) => (
                <button key={f} className={`chip${filter === f ? " on" : ""}`} onClick={() => setFilter(f)} data-testid={`tpl-filter-${f}`}>
                  {f === "all" ? "All" : PILL[f][1]} <span className="n">{counts[f] ?? 0}</span></button>
              ))}
            </div>
            <div className="row gap-6">
              <label className="search grow"><Icon name="magnifying-glass" size="sm" /><input placeholder="Search templates" value={q} onChange={(e) => setQ(e.target.value)} data-testid="tpl-search" aria-label="Search templates" /></label>
              <button className="btn btn-soft btn-icon" onClick={() => void sync()} disabled={busy} title="Sync statuses from Meta" aria-label="Sync statuses from Meta" data-testid="tpl-refresh"><Icon name="arrows-clockwise" /></button>
            </div>
          </div>
          <div className="tlist">
            {list === null && <div className="col gap-6" style={{ padding: 10 }}>{[1, 2, 3].map((k) => <span key={k} className="sk" style={{ height: 52 }} />)}</div>}
            {list && shown.length === 0 && <div className="empty"><p>No templates match.</p></div>}
            {shown.map((t) => (
              <div key={t.id} className={`ti${t.id === selId && !creating ? " on" : ""}`} data-testid="trow" onClick={() => { setCreating(false); setSelId(t.id); setViewEd(true); }}>
                <div className="l1"><b>{t.name}</b><span className={`pill sm ${PILL[t.status]?.[0] ?? "neutral"}`}>{PILL[t.status]?.[1] ?? t.status}</span></div>
                <p>{t.body}</p>
                <div className="l3"><span className="tag">{t.category === "MARKETING" ? "Marketing" : "Utility"}</span>{LANGS[t.language] ?? t.language}<span>·</span>{ago(t.updated_at)}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="card ecard" data-status={status} id="ed">
          {!sel && !creating ? (
            <div className="empty" style={{ flex: 1 }}><div className="art"><Icon name="notebook" /></div><h3>Pick a template</h3><p>Or create a new one to send after the 24-hour window or in broadcasts.</p><div className="acts"><button className="btn btn-primary" onClick={startCreate}><Icon name="plus" />New template</button></div></div>
          ) : (
            <>
              <header className="eh">
                <button className="btn btn-ghost btn-icon back" onClick={() => setViewEd(false)} aria-label="Back" data-testid="tedit-back"><Icon name="arrow-left" /></button>
                <span className="nm">{creating ? "New template" : sel!.name}</span>
                {!creating && <span className={`pill sm ${PILL[status]?.[0] ?? "neutral"}`}>{PILL[status]?.[1] ?? status}</span>}
                <span className="sp" />
                <button className="btn btn-soft btn-sm pvtoggle" onClick={() => setShowPv((v) => !v)} data-testid="tpl-preview-toggle"><Icon name="device-mobile" />{showPv ? "Edit" : "Preview"}</button>
                {sel && <button className="btn btn-ghost btn-sm btn-icon" onClick={() => void duplicate()} disabled={busy} title="Duplicate as draft" aria-label="Duplicate as draft"><Icon name="copy" /></button>}
              </header>
              <div className="eb">
                {note && <div className={`note ${note.kind}`} data-testid="tpl-note"><Icon name={note.kind === "ok" ? "check-circle" : "warning-circle"} /><span>{note.text}</span></div>}
                {!creating && status === "approved" && <div className="sbanner sb-approved" style={{ display: "flex" }}><Icon name="seal-check" /><div><b>Approved by Meta</b><p>Ready for broadcasts and for restarting closed chats. To change it, duplicate it and submit the copy for review.</p></div></div>}
                {!creating && status === "pending" && <div className="sbanner sb-pending" style={{ display: "flex" }}><Icon name="hourglass" /><div><b>In review with Meta</b><p>Submitted {ago(sel!.updated_at)}. Most templates are reviewed within an hour; some take up to 24 hours. Use sync to check.</p></div></div>}
                {!creating && status === "rejected" && <div className="sbanner sb-rejected" style={{ display: "flex" }}><Icon name="warning-circle" /><div style={{ flex: 1 }}><b>Rejected by Meta</b><p>{sel!.rejection_reason ? `Reason: ${sel!.rejection_reason}` : "Meta didn't share a reason."}</p>
                  <div className="rejbox"><span><b style={{ display: "inline", color: "var(--ink)" }}>How to fix:</b> the most common causes are a category that doesn't match the content (offers must be Marketing), variables at the very start or end of the message, or missing sample values. Edit below and resubmit.</span></div></div></div>}
                {(creating || status === "draft") && <div className="sbanner sb-draft" style={{ display: "flex" }}><Icon name="note-pencil" /><div><b>{creating ? "New draft" : "Draft — not submitted"}</b><p>Only approved templates can be sent. Submit when ready; review usually takes under an hour.</p></div></div>}

                <div className="blk"><div className="blk-h"><b>Basics</b></div><div className="blk-b"><div className="g3">
                  <div className="field"><label htmlFor="tpl-name">Name</label><input id="tpl-name" className={`input mono${name && !nameOk ? " err" : ""}`} value={name} onChange={(e) => setName(e.target.value.toLowerCase().replace(/\s+/g, "_"))} readOnly={!editable} placeholder="order_update" /><span className={`hint${name && !nameOk ? " err" : ""}`}>lowercase_with_underscores, 3–64 characters</span></div>
                  <div className="field"><label htmlFor="tpl-cat">Category</label>{creating ? <select id="tpl-cat" className="select" value={cat} onChange={(e) => setCat(e.target.value as "MARKETING" | "UTILITY")}><option value="MARKETING">Marketing</option><option value="UTILITY">Utility</option></select> : <div className="input" style={{ display: "flex", alignItems: "center", background: "var(--bg)" }}>{sel!.category === "MARKETING" ? "Marketing" : "Utility"}</div>}<span className="hint">Offers &amp; follow-ups = Marketing</span></div>
                  <div className="field"><label htmlFor="tpl-lang">Language</label>{creating ? <select id="tpl-lang" className="select" value={lang} onChange={(e) => setLang(e.target.value)}>{Object.entries(LANGS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select> : <div className="input" style={{ display: "flex", alignItems: "center", background: "var(--bg)" }}>{LANGS[sel!.language] ?? sel!.language}</div>}</div>
                </div></div></div>

                <div className="blk"><div className="blk-h"><b>Message</b><small>what the customer reads</small></div>
                  <div className="blk-b">
                    <div className="body-ed" data-testid="tpl-body">
                      <div className="tb">
                        <button className="btn btn-ghost btn-sm" style={{ color: "var(--grape-deep)" }} onClick={insertVar} disabled={!editable}><Icon name="brackets-curly" />Add variable</button>
                        <span className="cnt">{body.length} / 1024</span>
                      </div>
                      <textarea ref={bodyRef} className="txt" style={{ width: "100%", border: 0, resize: "vertical", minHeight: 120, background: "transparent", fontFamily: "inherit" }} value={body} onChange={(e) => setBody(e.target.value.slice(0, 1024))} readOnly={!editable} data-testid="tpl-body-input" placeholder="Hi {{1}}! Your order is ready for pickup." aria-label="Message body" />
                    </div>
                    {vars.length > 0 && (
                      <>
                        <div className="eyebrow">Sample values <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 600 }}>— Meta needs these to review</span></div>
                        <div className="samples">{vars.map((n) => (
                          <div key={n} style={{ display: "contents" }}><span className="v">{`{{${n}}}`}{sel?.variables?.[+n - 1] ? ` ${sel.variables[+n - 1]}` : ""}</span><input className="input" value={samples[n] ?? SAMPLE[n] ?? ""} onChange={(e) => setSamples({ ...samples, [n]: e.target.value })} aria-label={`Sample value for variable ${n}`} /></div>
                        ))}</div>
                      </>
                    )}
                  </div></div>
                {sel && (sel.header || sel.footer || sel.buttons) && (
                  <div className="blk"><div className="blk-h"><b>Header, footer &amp; buttons</b><small>set in Meta</small></div><div className="blk-b"><dl className="kv"><dt>Header</dt><dd>{sel.header ?? "—"}</dd><dt>Footer</dt><dd>{sel.footer ?? "—"}</dd><dt>Buttons</dt><dd>{sel.buttons ?? "—"}</dd></dl></div></div>
                )}
                <div className="pv-inline" style={{ flexDirection: "column", alignItems: "center", gap: 14 }}>{preview}{pvMeta}</div>
              </div>
              <footer className="ef">
                <span className="xs faint grow" style={{ fontWeight: 600 }}>{creating ? "New templates are reviewed by Meta before you can send them." : `Updated ${ago(sel!.updated_at)}`}</span>
                {creating ? (
                  <>
                    <button className="btn btn-soft" onClick={() => setCreating(false)}>Cancel</button>
                    <button className="btn btn-soft" disabled={busy || !nameOk || body.trim().length < 5} onClick={() => void create(false)}>Save draft</button>
                    <button className="btn btn-primary" disabled={busy || !nameOk || body.trim().length < 5} onClick={() => void create(true)} data-testid="tpl-submit"><Icon name="paper-plane-tilt" />Submit for review</button>
                  </>
                ) : editable ? (
                  <>
                    <button className="btn btn-soft" disabled={busy || !dirty || !nameOk} onClick={() => void save()}>Save draft</button>
                    <button className="btn btn-primary" disabled={busy || !nameOk || body.trim().length < 5} onClick={() => void submit()} data-testid="tpl-submit"><Icon name="paper-plane-tilt" />{status === "rejected" ? "Resubmit" : "Submit for review"}</button>
                  </>
                ) : (
                  <button className="btn btn-soft" onClick={() => void duplicate()} disabled={busy}><Icon name="copy" />Duplicate to edit</button>
                )}
              </footer>
            </>
          )}
        </section>

        <aside className="card pcard">
          <div className="card-h line"><span className="h3">Preview</span><span className="xs faint" style={{ fontWeight: 600 }}>as the customer sees it</span></div>
          <div className="pv-body">{(sel || creating) ? <>{preview}{pvMeta}</> : <div className="empty"><p>Pick a template to preview it.</p></div>}</div>
        </aside>

        <section className="card zero" style={{ alignItems: "center", justifyContent: "center" }}>
          <div className="empty" style={{ maxWidth: 520 }}>
            <div className="art"><Icon name="notebook" /></div>
            <h3>Templates let you message customers any time</h3>
            <p>WhatsApp only allows free-form replies for 24 hours after a customer writes. After that, and for broadcasts, you need a template that Meta has approved.</p>
            <div className="acts"><button className="btn btn-primary" onClick={startCreate}><Icon name="plus" />Create a template</button><button className="btn btn-soft" onClick={() => void sync()}><Icon name="arrows-clockwise" />Sync from Meta</button></div>
          </div>
        </section>
      </div>
    </div>
  );
}
