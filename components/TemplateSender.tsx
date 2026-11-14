"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { WaBubble, tokensOf, tplMediaUrl, type Tpl } from "@/components/WaBubble";
import { avatarClass, fmtPhone, initials } from "@/lib/ui";

type Who = { id: string; name: string | null; waId: string };
type CtRow = { id: string; name: string | null; wa_id: string; opt_in: boolean };

/**
 * Send one approved template to one person. Pick the template, fill the variables ({{1}} starts as the
 * first name), see exactly what they'll get, send. Without a `contact`, it starts with a contact search.
 * `compact` is the inbox version that takes the composer's place when the 24-hour window is closed.
 */
export function TemplateSender({ contact, templateId, compact = false, onSent, onClose }: {
  contact?: Who | null; templateId?: string | null; compact?: boolean;
  onSent?: (r: { conversationId: string; contactId: string }) => void; onClose?: () => void;
}) {
  const [tpls, setTpls] = useState<Tpl[] | null>(null);
  const [who, setWho] = useState<Who | null>(contact ?? null);
  const [pick, setPick] = useState<string | null>(templateId ?? null);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [q, setQ] = useState("");
  const [cts, setCts] = useState<CtRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch("/api/templates", { cache: "no-store" }).then((r) => r.json())
      .then((d) => setTpls(((d?.templates ?? []) as Tpl[]).filter((t) => t.status === "approved"))).catch(() => setTpls([]));
  }, []);
  useEffect(() => { if (!who) fetch("/api/contacts", { cache: "no-store" }).then((r) => r.json()).then((d) => setCts(d?.contacts ?? [])).catch(() => setCts([])); }, [who]);
  useEffect(() => { if (!pick && tpls?.length === 1) setPick(tpls[0].id); }, [tpls, pick]);

  const t = tpls?.find((x) => x.id === pick) ?? null;
  const vars = t ? tokensOf(t.body) : [];
  const first = (who?.name ?? "").replace(/^@/, "").split(" ")[0];
  // {{1}} = first name by default; the rest start empty so nothing goes out with a placeholder
  useEffect(() => { if (t) setVals(Object.fromEntries(tokensOf(t.body).map((n) => [n, n === "1" && first ? first : ""]))); setErr(""); }, [t?.id, first]);
  const missing = vars.filter((n) => !vals[n]?.trim());
  const shownCts = useMemo(() => {
    const n = q.trim().toLowerCase(), d = n.replace(/\D/g, "");
    return (cts ?? []).filter((c) => !n || (c.name ?? "").toLowerCase().includes(n) || (d && c.wa_id.includes(d))).slice(0, 8);
  }, [cts, q]);

  async function send() {
    if (!t || !who || missing.length) return;
    setBusy(true); setErr("");
    try {
      const r = await fetch(`/api/contacts/${who.id}/template`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ templateId: t.id, params: vars.map((n) => vals[n] ?? "") }) });
      const d = (await r.json().catch(() => null)) as { ok?: boolean; error?: string; conversationId?: string } | null;
      if (!r.ok || !d?.ok) { setErr(d?.error ?? "Couldn't send — try again."); return; }
      setDone(true); onSent?.({ conversationId: d.conversationId!, contactId: who.id });
    } finally { setBusy(false); }
  }

  if (done && !compact) return (
    <div className="tsend done" data-testid="tsend-done"><span className="icon-tile green"><Icon name="check-circle" /></span>
      <div><b>Sent to {who?.name ?? fmtPhone(who?.waId ?? "")}</b><p>When they reply, the 24-hour window opens and you can chat freely.</p></div>
      <div className="row gap-6"><button className="btn btn-soft btn-sm" onClick={onClose}>Close</button></div></div>
  );

  return (
    <div className={`tsend${compact ? " compact" : ""}`} data-testid="tsend">
      {!who ? (
        <div className="ts-who">
          <label className="search"><Icon name="magnifying-glass" size="sm" /><input autoFocus placeholder="Search a contact by name or number" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search contacts" data-testid="tsend-search" /></label>
          <div className="ts-cts">
            {cts === null && <span className="sk" style={{ height: 40 }} />}
            {cts?.length === 0 && <p className="xs faint">No contacts yet — add one on the Contacts page.</p>}
            {shownCts.map((c) => (
              <button key={c.id} className="ts-ct" onClick={() => setWho({ id: c.id, name: c.name, waId: c.wa_id })} data-testid="tsend-contact">
                <span className={`av sm ${avatarClass(c.wa_id)}`}>{initials(c.name, c.wa_id)}</span>
                <span className="grow trunc"><b>{c.name ?? fmtPhone(c.wa_id)}</b><small>{fmtPhone(c.wa_id)}</small></span>
                {!c.opt_in && <span className="pill sm neutral nodot" title="Hasn't opted in to marketing">Not opted in</span>}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          {!compact && !contact && <div className="ts-to"><span className="xs faint">To</span><b>{who.name ?? fmtPhone(who.waId)}</b><button className="btn-link xs" onClick={() => setWho(null)}>Change</button></div>}
          <div className={`ts-grid${t ? " with-pv" : ""}`}>
            <div className="ts-l">
              <div className="eyebrow">{compact ? "Restart the chat with an approved template" : "Template"}</div>
              {tpls === null && <span className="sk" style={{ height: 36 }} />}
              {tpls?.length === 0 && <div className="note warn" style={{ fontSize: "var(--fs-xs)" }}><Icon name="hourglass" size="sm" /><span>No approved templates yet. <a href="/templates?new=1" className="btn-link">Create one</a> — Meta usually reviews it within an hour.</span></div>}
              {!!tpls?.length && (
                <div className="ts-tpls" role="radiogroup" aria-label="Templates">
                  {tpls.map((x) => (
                    <button key={x.id} role="radio" aria-checked={x.id === pick} className={`ts-tpl${x.id === pick ? " on" : ""}`} onClick={() => setPick(x.id)} data-testid="tsend-tpl">
                      <span className="nm">{x.name}</span><small>{x.category === "MARKETING" ? "Marketing" : "Utility"}{x.header_format !== "NONE" && x.header_format !== "TEXT" ? ` · ${x.header_format.toLowerCase()}` : ""}</small>
                    </button>
                  ))}
                </div>
              )}
              {t && vars.length > 0 && (
                <div className="ts-vars">
                  {vars.map((n) => (
                    <label key={n} className="ts-var"><span className="v">{`{{${n}}}`}</span>
                      <input className="input" value={vals[n] ?? ""} onChange={(e) => setVals({ ...vals, [n]: e.target.value })} placeholder={t.variables?.[+n - 1] ? `e.g. ${t.variables[+n - 1]}` : n === "1" ? "First name" : "Value"} aria-label={`Value for {{${n}}}`} data-testid={`tsend-var-${n}`} />
                    </label>
                  ))}
                </div>
              )}
              {t?.category === "MARKETING" && <p className="xs faint" style={{ fontWeight: 600 }}><Icon name="info" size="xs" /> Marketing templates are charged by Meta per message (about ₹0.78 in India).</p>}
            </div>
            {t && <div className="ts-pv"><WaBubble format={t.header_format} headerText={t.header} mediaUrl={tplMediaUrl(t)} mediaName={t.header_media_name} body={t.body} values={vals} footer={t.footer} buttons={t.buttons_json} /></div>}
          </div>
          {err && <div className="note bad" style={{ fontSize: "var(--fs-xs)" }}><Icon name="warning-circle" size="sm" /><span>{err}</span></div>}
          <div className="ts-f">
            {compact && <a className="btn btn-ghost btn-sm" href="/templates"><Icon name="notebook" />Manage templates</a>}
            <span className="sp" />
            {onClose && !compact && <button className="btn btn-soft" onClick={onClose}>Cancel</button>}
            <button className="btn btn-primary" disabled={!t || busy || missing.length > 0} onClick={() => void send()} data-testid="tsend-send"
              title={missing.length ? `Fill in ${missing.map((n) => `{{${n}}}`).join(", ")}` : undefined}>
              <Icon name="paper-plane-right" />{busy ? "Sending…" : done ? "Sent ✓" : "Send template"}</button>
          </div>
        </>
      )}
    </div>
  );
}

/** Modal wrapper (contacts drawer, template kebab menu). */
export function TemplateSendModal({ open, onClose, ...p }: Parameters<typeof TemplateSender>[0] & { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="card modal" role="dialog" aria-modal="true" aria-label="Send a template" onClick={(e) => e.stopPropagation()} data-testid="tsend-modal">
        <div className="card-h line"><span className="h3">Send a template</span><span className="sp" /><button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Close"><Icon name="x" /></button></div>
        <div style={{ padding: "var(--pad)" }}><TemplateSender {...p} onClose={onClose} /></div>
      </div>
    </div>
  );
}
