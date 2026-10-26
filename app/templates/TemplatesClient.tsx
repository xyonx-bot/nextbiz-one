"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Templates surface — ported 1:1 from templates/wireframe.html: tzone
 * (300px list | editor | 316px live phone preview), status pills with
 * counts, search + refresh, trow list, editor rows (name/lang, category +
 * header, body with {{n}} variable chips + insert row, buttons/footer),
 * te-reject note, phone preview with sample-value strip.
 *
 * Wireframe body-state toggles: panel-open (phone flyout/sheet <1280),
 * show-editor (mobile master→detail). Cleaned up on unmount.
 */
type Tpl = {
  id: string; name: string; meta_name: string | null; category: string;
  language: string; body: string; variables: string[]; status: string;
  rejection_reason: string | null; updated_at: string;
  header: string | null; buttons: string | null; footer: string | null;
};

const ST_CLASS: Record<string, string> = {
  approved: "st ok", pending: "st pend", rejected: "st rej", draft: "st draft",
};

const VAR_LABELS: Record<string, string> = { "1": "name", "2": "date" };
const SAMPLE_DEFAULTS: Record<string, string> = {
  "1": "Rahul", "2": "Oct 21", "3": "NextBiz Studio",
};

function tokensOf(body: string) {
  return [...new Set(body.match(/\{\{\d+\}\}/g) ?? [])].sort();
}

/** Split body into text/var segments for the chip-styled display. */
function renderBodyChips(body: string, vars: string[]) {
  const parts = body.split(/(\{\{\d+\}\})/g);
  return parts.map((p, i) => {
    const m = p.match(/^\{\{(\d+)\}\}$/);
    if (m) {
      const n = m[1];
      const label = vars[Number(n) - 1] ?? VAR_LABELS[n] ?? `variable ${n}`;
      return <span key={i} className="v" data-var={n} title={label}>{"{{" + n + "}}"}</span>;
    }
    return <span key={i}>{p}</span>;
  });
}

export function TemplatesClient() {
  const [list, setList] = useState<Tpl[]>([]);
  const [sel, setSel] = useState<Tpl | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [bodyDraft, setBodyDraft] = useState("");
  const [samples, setSamples] = useState<Record<string, string>>({});
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/templates");
    const data = (await res.json().catch(() => null)) as { templates?: Tpl[] } | null;
    setList(data?.templates ?? []);
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Wireframe body-state classes — cleaned up on unmount.
  useEffect(() => {
    return () => document.body.classList.remove("panel-open", "show-editor");
  }, []);

  async function refreshStatuses() {
    setBusy(true); setNote("");
    const res = await fetch("/api/templates/refresh", { method: "POST" });
    const data = (await res.json().catch(() => null)) as { ok?: boolean; updated?: number; error?: string } | null;
    if (data?.ok) setNote(`Statuses refreshed — ${data.updated ?? 0} updated.`);
    else setNote(data?.error ?? "Refresh failed.");
    await load();
    setBusy(false);
  }

  async function submit(t: Tpl) {
    setBusy(true); setNote("");
    const res = await fetch(`/api/templates/${t.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "submit" }),
    });
    const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    setNote(data?.ok ? "Submitted to Meta — approval usually takes minutes to a day." : (data?.error ?? "Submit failed."));
    await load();
    setSel(null);
    setBusy(false);
  }

  async function saveBody() {
    if (!selFresh) return;
    setBusy(true);
    await fetch(`/api/templates/${selFresh.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: bodyDraft }),
    });
    await load();
    setBusy(false);
  }

  function insertVar(n: string) {
    const el = bodyRef.current;
    if (!el) return;
    const token = `{{${n}}}`;
    const s = el.selectionStart ?? bodyDraft.length;
    const e = el.selectionEnd ?? bodyDraft.length;
    const next = bodyDraft.slice(0, s) + token + bodyDraft.slice(e);
    setBodyDraft(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + token.length, s + token.length);
    });
  }

  const counts = {
    all: list.length,
    approved: list.filter((t) => t.status === "approved").length,
    pending: list.filter((t) => t.status === "pending").length,
    rejected: list.filter((t) => t.status === "rejected").length,
    draft: list.filter((t) => t.status === "draft").length,
  };
  const shown = list.filter(
    (t) => (filter === "all" || t.status === filter) && (!q || t.name.toLowerCase().includes(q.toLowerCase())),
  );
  const selFresh = sel ? list.find((t) => t.id === sel.id) ?? sel : null;

  // keep the editable body in sync with the selection
  const selKey = selFresh?.id ?? "";
  const lastKey = useRef("");
  useEffect(() => {
    if (selFresh && lastKey.current !== selFresh.id) {
      lastKey.current = selFresh.id;
      setBodyDraft(selFresh.body);
    }
    if (!selFresh) lastKey.current = "";
  }, [selFresh]);

  const vars = selFresh?.variables ?? [];
  const varNums = tokensOf(selFresh?.body ?? "");
  const canEdit = selFresh?.status === "draft" || selFresh?.status === "rejected";

  function sampleOf(n: string) {
    const v = samples[n] ?? SAMPLE_DEFAULTS[n] ?? "";
    return v || `{{${n}}}`;
  }
  function previewBody() {
    if (!selFresh) return "";
    return selFresh.body.replace(/\{\{(\d+)\}\}/g, (_m, n: string) => sampleOf(n));
  }
  function renderPhoneMsg() {
    const txt = previewBody();
    return txt.split(/(\{\{\d+\}\})/g).map((p, i) => {
      const m = p.match(/^\{\{(\d+)\}\}$/);
      if (m) return <span key={i} className="pv">{sampleOf(m[1])}</span>;
      return <span key={i}>{p}</span>;
    });
  }

  return (
    <div className="tzone" data-testid="templates">
      <section className="tlist" aria-label="Templates">
        <div className="tlist-head">
          <div className="tpills">
            {(["all", "approved", "pending", "rejected", "draft"] as const).map((f) => (
              <span key={f} className={`chip${filter === f ? " on" : ""}`} data-testid={`tpl-filter-${f}`} onClick={() => setFilter(f)}>
                {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)} <span className="n">{counts[f]}</span>
              </span>
            ))}
          </div>
          <div className="tsearch">
            <img src="https://cdn.joyverse.fun/mira-assets/phosphor/bold/magnifying-glass-bold.svg" alt="" />
            <input placeholder="Search templates…" value={q} onChange={(e) => setQ(e.target.value)} data-testid="tpl-search"
                   style={{ border: 0, outline: "none", background: "transparent", flex: 1, minWidth: 0, fontSize: "11.5px", color: "var(--ink)" }} />
            <button className="btn btn-soft" style={{ minHeight: 26, padding: "0 8px", fontSize: "9.5px", flexShrink: 0, whiteSpace: "nowrap" }} disabled={busy} onClick={() => void refreshStatuses()} data-testid="tpl-refresh">Refresh</button>
          </div>
        </div>
        <div className="trows">
          {shown.length === 0 && (
            <div style={{ padding: "20px 14px", color: "var(--ink-3)", fontSize: "11px" }}>
              No templates here — refresh statuses or switch filter.
            </div>
          )}
          {shown.map((t) => (
            <div key={t.id} className={`trow${selFresh?.id === t.id ? " on" : ""}`} data-testid="trow"
                 onClick={() => { setSel(t); if (window.innerWidth < 640) document.body.classList.add("show-editor"); }}>
              <div className="r1"><b>{t.name}</b><span className={ST_CLASS[t.status] ?? "st draft"}>{t.status.charAt(0).toUpperCase() + t.status.slice(1)}</span></div>
              <div className="r2"><span className="cat">{t.category === "MARKETING" ? "Marketing" : "Utility"}</span><span className="lang">{t.language}</span></div>
            </div>
          ))}
        </div>
      </section>

      <section className="tedit" aria-label="Template editor">
        {!selFresh ? (
          <div style={{ display: "grid", placeItems: "center", height: "100%", color: "var(--ink-3)", fontSize: "11.5px", padding: 20 }}>
            Pick a template to edit — or duplicate one to make a draft.
          </div>
        ) : (
          <>
            <div className="te-head">
              <button className="back" onClick={() => document.body.classList.remove("show-editor")} aria-label="Back" data-testid="tedit-back">
                <img src="https://cdn.joyverse.fun/mira-assets/phosphor/bold/arrow-left-bold.svg" alt="" />
              </button>
              <b>{selFresh.name}</b>
              <span className={ST_CLASS[selFresh.status]} style={{ justifySelf: "start" }}>{selFresh.status}</span>
              <div className="acts" style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
                <button className="btn btn-soft prevbtn" disabled={busy}
                        onClick={() => document.body.classList.toggle("panel-open")} data-testid="tpl-preview-toggle">
                  <img src="https://cdn.joyverse.fun/mira-assets/phosphor/bold/phone-bold.svg" alt="" style={{ width: 12, height: 12 }} />Preview
                </button>
                <button className="btn btn-soft" style={{ minHeight: 28, padding: "0 10px", fontSize: 10 }} disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          await fetch(`/api/templates/${selFresh.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "duplicate" }) });
                          await load(); setBusy(false); setNote("Duplicated as a draft.");
                        }}>Duplicate</button>
                {canEdit && (
                  <button className="btn btn-primary" style={{ minHeight: 28, padding: "0 10px", fontSize: 10 }} disabled={busy}
                          onClick={() => void submit(selFresh)} data-testid="tpl-submit">
                    <img src="https://cdn.joyverse.fun/mira-assets/phosphor/bold/paper-plane-tilt-bold.svg" alt="" style={{ width: 12, height: 12 }} />Submit for approval
                  </button>
                )}
              </div>
            </div>
            <div className="te-body">
              <div className="te-row">
                <div className="te-field">
                  <div className="lb">Template name <em>· lowercase_with_underscores</em></div>
                  <div className="te-in">{selFresh.name}</div>
                </div>
                <div className="te-field">
                  <div className="lb">Language</div>
                  <div className="te-in">{selFresh.language === "en_IN" ? "English (India) · en_IN" : selFresh.language}</div>
                </div>
              </div>
              <div className="te-row">
                <div className="te-field">
                  <div className="lb">Category <em>· per Meta policy</em></div>
                  <div className="te-in">{selFresh.category === "MARKETING" ? "Marketing" : "Utility"}</div>
                  <div className="te-hint">Marketing templates go to opted-in contacts anytime. Utility only inside a conversation window.</div>
                </div>
                <div className="te-field">
                  <div className="lb">Header <em>· optional</em></div>
                  <div className="te-in">{selFresh.header ?? <span style={{ color: "var(--ink-3)", fontWeight: 500 }}>No header</span>}</div>
                </div>
              </div>
              <div className="te-row single">
                <div className="te-field">
                  <div className="lb">Body <em>· {"{{n}}"} marks variables</em></div>
                  <div className="te-in b" data-testid="tpl-body">{renderBodyChips(selFresh.body, vars)}</div>
                  {canEdit ? (
                    <>
                      {vars.length > 0 && (
                        <div className="te-hint">
                          <b>Variables:</b> {vars.map((v, i) => <span key={i}>{`{{${i + 1}}}`} = {v}{i < vars.length - 1 ? " · " : ""}</span>)}
                        </div>
                      )}
                      <div className="te-btnrow">
                        {varNums.map((tok) => {
                          const n = tok.replace(/\D/g, "");
                          return (
                            <span key={tok} className="chip chip-info" style={{ cursor: "pointer" }} onClick={() => insertVar(n)}>
                              {tok} {(vars[Number(n) - 1] ?? VAR_LABELS[n] ?? "")}
                            </span>
                          );
                        })}
                      </div>
                      <textarea className="te-in bt" ref={bodyRef} data-testid="tpl-body-input" value={bodyDraft}
                                onChange={(e) => setBodyDraft(e.target.value)} onBlur={() => void saveBody()}
                                style={{ minHeight: 90, resize: "vertical" }} />
                      <div className="te-hint">Changes save when you leave the field.</div>
                    </>
                  ) : (
                    <div className="te-hint">Submitted templates can’t be edited — duplicate to create an editable draft.</div>
                  )}
                </div>
              </div>
              <div className="te-row">
                <div className="te-field">
                  <div className="lb">Buttons <em>· optional, up to 3</em></div>
                  <div className="te-in">{selFresh.buttons ?? <span style={{ color: "var(--ink-3)", fontWeight: 500 }}>None</span>}</div>
                </div>
                <div className="te-field">
                  <div className="lb">Footer <em>· optional</em></div>
                  <div className="te-in">{selFresh.footer ?? <span style={{ color: "var(--ink-3)", fontWeight: 500 }}>None</span>}</div>
                </div>
              </div>
              {selFresh.status === "rejected" && (
                <div className="te-reject">
                  <img src="https://cdn.joyverse.fun/mira-assets/phosphor/bold/warning-circle-bold.svg" alt="" />
                  <div className="t">
                    <b>Rejected by Meta</b>
                    <span>{selFresh.rejection_reason ?? "See Meta’s template manager for details."} Edit &amp; resubmit after fixing.</span>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
        {note && <div style={{ padding: "0 16px 14px", fontSize: 11, color: "var(--info)" }} data-testid="tpl-note">{note}</div>}
      </section>

      <aside className="tphone" aria-label="Live preview">
        <div className="tp-head">
          <b>Live preview</b>
          <span>as the customer sees it</span>
        </div>
        <div className="tp-body">
          {!selFresh ? (
            <div style={{ display: "grid", placeItems: "center", height: "100%", color: "var(--ink-3)", fontSize: "11.5px" }}>
              Pick a template to preview it.
            </div>
          ) : (
            <>
              <div className="phone">
                <div className="notch" />
                <div className="screen">
                  <div className="iosbar">
                    <span>{new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
                    <span className="ic">
                      <img src="https://cdn.joyverse.fun/mira-assets/phosphor/bold/cell-signal-full-bold.svg" alt="" />
                      <img src="https://cdn.joyverse.fun/mira-assets/phosphor/bold/wifi-high-bold.svg" alt="" />
                      <img src="https://cdn.joyverse.fun/mira-assets/phosphor/bold/battery-full-bold.svg" alt="" />
                    </span>
                  </div>
                  <div className="wabar">
                    <img className="back" src="https://cdn.joyverse.fun/mira-assets/phosphor/bold/arrow-left-bold.svg" alt="" />
                    <div className="pa">AS</div>
                    <div className="pn"><b>Acme Studio</b><small>online</small></div>
                    <span className="ic">
                      <img src="https://cdn.joyverse.fun/mira-assets/phosphor/bold/video-camera-bold.svg" alt="" />
                      <img src="https://cdn.joyverse.fun/mira-assets/phosphor/bold/phone-bold.svg" alt="" />
                      <img src="https://cdn.joyverse.fun/mira-assets/phosphor/bold/dots-three-vertical-bold.svg" alt="" />
                    </span>
                  </div>
                  <div className="pchat">
                    <div className="pdate"><span>Today</span></div>
                    <div className="pmsg">
                      {selFresh.header && <div className="ph">{selFresh.header}</div>}
                      {renderPhoneMsg()}
                      <span className="pmeta">{new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                    {selFresh.buttons && <div className="pbtn">{selFresh.buttons}</div>}
                  </div>
                  <div className="homebar" />
                </div>
              </div>
              <div className="tp-lab">Sample values</div>
              <div className="tp-samples">
                {varNums.length === 0 && (
                  <div style={{ fontSize: "10px", color: "var(--ink-3)" }}>No variables — this template sends the same message to everyone.</div>
                )}
                {varNums.map((tok) => {
                  const n = tok.replace(/\D/g, "");
                  const label = vars[Number(n) - 1] ?? VAR_LABELS[n] ?? `variable ${n}`;
                  return (
                    <div className="s" key={tok}>
                      <div className="k">{tok} {label}</div>
                      <input className="v" value={samples[n] ?? SAMPLE_DEFAULTS[n] ?? ""}
                             onChange={(e) => setSamples((s) => ({ ...s, [n]: e.target.value }))} />
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
