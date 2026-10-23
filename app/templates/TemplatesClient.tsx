"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Templates surface — ported 1:1 from templates/wireframe.html: status pills
 * with counts, search well, trow list (name + status chip + category/lang),
 * editor column (fields + body with {{n}} chips, Duplicate + Submit actions,
 * rejected note card). Status refresh pulls Meta's live statuses.
 */
type Tpl = {
  id: string; name: string; meta_name: string | null; category: string;
  language: string; body: string; variables: string[]; status: string;
  rejection_reason: string | null; updated_at: string;
};

const ST_CLASS: Record<string, string> = {
  approved: "st ok", pending: "st pend", rejected: "st rej", draft: "st draft",
};

export function TemplatesClient() {
  const [list, setList] = useState<Tpl[]>([]);
  const [sel, setSel] = useState<Tpl | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/templates");
    const data = (await res.json().catch(() => null)) as { templates?: Tpl[] } | null;
    setList(data?.templates ?? []);
  }, []);
  useEffect(() => { void load(); }, [load]);

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

  const counts = {
    all: list.length,
    approved: list.filter((t) => t.status === "approved").length,
    pending: list.filter((t) => t.status === "pending").length,
    rejected: list.filter((t) => t.status === "rejected").length,
    draft: list.filter((t) => t.status === "draft").length,
  };
  const shown = list.filter((t) => !q || t.name.toLowerCase().includes(q.toLowerCase()));
  const selFresh = sel ? list.find((t) => t.id === sel.id) ?? sel : null;

  return (
    <div className="templates" data-testid="templates">
      <section className="tlist" aria-label="Templates">
        <div className="tlist-head">
          <div className="kpills">
            <span className="chip on">All <span className="n">{counts.all}</span></span>
            <span className="chip">Approved <span className="n">{counts.approved}</span></span>
            <span className="chip">Pending <span className="n">{counts.pending}</span></span>
            <span className="chip">Rejected <span className="n">{counts.rejected}</span></span>
            <span className="chip">Drafts <span className="n">{counts.draft}</span></span>
          </div>
          <div className="ksearch">
            <img src="https://cdn.joyverse.fun/mira-assets/phosphor/bold/magnifying-glass-bold.svg" alt="" />
            <input placeholder="Search templates…" value={q} onChange={(e) => setQ(e.target.value)} data-testid="tpl-search"
                   style={{ border: 0, outline: "none", background: "transparent", flex: 1, fontSize: "11.5px", color: "var(--ink)" }} />
            <button className="btn btn-soft" style={{ minHeight: 26, padding: "0 9px", fontSize: "10px" }} disabled={busy} onClick={() => void refreshStatuses()} data-testid="tpl-refresh">Refresh statuses</button>
          </div>
        </div>
        <div className="trows">
          {shown.length === 0 && (
            <div style={{ padding: "20px 14px", color: "var(--ink-3)", fontSize: "11px" }}>
              No templates yet — create one in the editor.
            </div>
          )}
          {shown.map((t) => (
            <div key={t.id} className={`trow${selFresh?.id === t.id ? " on" : ""}`} data-testid="trow" onClick={() => setSel(t)}>
              <div className="r1"><b>{t.name}</b><span className={ST_CLASS[t.status] ?? "st draft"}>{t.status.charAt(0).toUpperCase() + t.status.slice(1)}</span></div>
              <div className="r2"><span className="cat">{t.category === "MARKETING" ? "Marketing" : "Utility"}</span><span className="lang">{t.language}</span></div>
            </div>
          ))}
        </div>
      </section>

      <section className="tedit" aria-label="Template editor">
        {!selFresh ? (
          <div style={{ display: "grid", placeItems: "center", height: "100%", color: "var(--ink-3)", fontSize: "11.5px", padding: 20 }}>
            Pick a template to edit — or create a draft below.
          </div>
        ) : (
          <>
            <div className="te-head">
              <b>{selFresh.name}</b>
              <span className={ST_CLASS[selFresh.status]} style={{ justifySelf: "start" }}>{selFresh.status}</span>
              <div className="acts" style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
                <button className="btn btn-soft" style={{ minHeight: 28, padding: "0 10px", fontSize: 10 }} disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          await fetch(`/api/templates/${selFresh.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "duplicate" }) });
                          await load(); setBusy(false); setNote("Duplicated as a draft.");
                        }}>Duplicate</button>
                <button className="btn btn-primary" style={{ minHeight: 28, padding: "0 10px", fontSize: 10 }} disabled={busy}
                        onClick={() => void submit(selFresh)} data-testid="tpl-submit">
                  <img src="https://cdn.joyverse.fun/mira-assets/phosphor/bold/paper-plane-tilt-bold.svg" alt="" style={{ width: 12, height: 12 }} />Submit for approval
                </button>
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
                  <div className="te-in">{selFresh.language}</div>
                </div>
              </div>
              <div className="te-row">
                <div className="te-field">
                  <div className="lb">Category</div>
                  <div className="te-in">{selFresh.category === "MARKETING" ? "Marketing" : "Utility"}</div>
                </div>
              </div>
              <div className="te-field">
                <div className="lb">Body</div>
                <div className="te-in" data-testid="tpl-body" style={{ minHeight: 110, alignItems: "flex-start", lineHeight: 1.6 }}>
                  {selFresh.body}
                </div>
              </div>
              {selFresh.status === "rejected" && (
                <div className="rejnote" style={{ border: "1px solid var(--danger)", background: "var(--danger-tint)", borderRadius: "var(--r-md)", padding: 12, display: "flex", gap: 8, fontSize: 11 }}>
                  <img src="https://cdn.joyverse.fun/mira-assets/phosphor/bold/warning-circle-bold.svg" alt="" style={{ width: 14, height: 14 }} />
                  <span><b>Rejected by Meta</b> — {selFresh.rejection_reason ?? "see Meta's template manager for details"}. Edit & resubmit after fixing.</span>
                </div>
              )}
              <div className="te-field">
                <div className="lb">Body text (edit a draft)</div>
                <textarea className="te-in" data-testid="tpl-body-input" defaultValue={selFresh.body}
                          onBlur={async (e) => {
                            setBusy(true);
                            await fetch(`/api/templates/${selFresh.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: e.target.value }) });
                            await load(); setBusy(false);
                          }}
                          style={{ minHeight: 110, width: "100%", border: "1px solid var(--line)", borderRadius: "var(--r-sm)", padding: 10, fontSize: 12, background: "var(--surface)", color: "var(--ink)", resize: "vertical" }} />
              </div>
            </div>
          </>
        )}
        {note && <div style={{ padding: "0 16px 14px", fontSize: 11, color: "var(--info)" }} data-testid="tpl-note">{note}</div>}
      </section>
    </div>
  );
}
