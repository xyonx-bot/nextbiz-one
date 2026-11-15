"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { TemplateSendModal } from "@/components/TemplateSender";
import { SAMPLE, WaBubble, tokensOf, tplMediaUrl, type HeaderFormat, type Tpl, type TplButton } from "@/components/WaBubble";

/**
 * Templates — list | sectioned editor | phone preview.
 * Editor covers everything Meta reviews: header (text, image, video or PDF with a sample file), body with
 * variables + samples, footer, buttons (quick replies, website, call). Each list card has a ⋮ menu for
 * the quick actions: send to one contact, use in a broadcast, submit, duplicate, delete.
 */
const PILL: Record<string, [string, string]> = { approved: ["ok", "Approved"], pending: ["warn", "In review"], rejected: ["bad", "Rejected"], draft: ["neutral", "Draft"] };
const LANGS: Record<string, string> = { en_IN: "English (India)", en_US: "English (US)", en: "English", hi: "Hindi", bn: "Bengali" };
const HEADERS: [HeaderFormat, string, string][] = [["NONE", "None", "prohibit"], ["TEXT", "Text", "text-aa"], ["IMAGE", "Image", "image"], ["VIDEO", "Video", "video-camera"], ["DOCUMENT", "PDF", "file-pdf"]];
const ACCEPT: Record<string, string> = { IMAGE: "image/jpeg,image/png", VIDEO: "video/mp4", DOCUMENT: "application/pdf" };
const LIMIT: Record<string, string> = { IMAGE: "JPG or PNG, up to 5 MB", VIDEO: "MP4, up to 16 MB", DOCUMENT: "PDF, up to 16 MB" };
const ago = (iso: string) => { const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000); return m < 60 ? `${Math.max(1, m)} min ago` : m < 2880 ? `${Math.floor(m / 60)}h ago` : new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }); };
const isMedia = (f: HeaderFormat) => f === "IMAGE" || f === "VIDEO" || f === "DOCUMENT";

type Media = { id: string; name: string; mime: string; url: string } | null;

function Phone({ children }: { children: React.ReactNode }) {
  return (
    <div className="phone"><div className="scr">
      <div className="sbar"><span>9:41</span><span>●●● ▮</span></div>
      <div className="wah"><Icon name="arrow-left" /><span className="av"><img src="/logo.png" alt="" /></span><span><b>Your business</b><small>Business account</small></span></div>
      <div className="wab"><span className="d">TODAY</span>{children}</div>
    </div></div>
  );
}

function Thumb({ t }: { t: Tpl }) {
  const f = t.header_format;
  if (f === "IMAGE" && t.header_media_id) return <span className="tthumb"><img src={`/api/media/${t.header_media_id}`} alt="" loading="lazy" /></span>;
  const icon = f === "IMAGE" ? "image" : f === "VIDEO" ? "video-camera" : f === "DOCUMENT" ? "file-pdf" : f === "TEXT" ? "text-aa" : "chat-text";
  return <span className={`tthumb ic ${t.category === "MARKETING" ? "mk" : "ut"}`}><Icon name={icon} /></span>;
}

export function TemplatesClient({ startNew = false }: { startNew?: boolean }) {
  const [list, setList] = useState<Tpl[] | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const [creating, setCreating] = useState(startNew);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);
  // editor state
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [cat, setCat] = useState<"MARKETING" | "UTILITY">("MARKETING");
  const [lang, setLang] = useState("en_IN");
  const [samples, setSamples] = useState<Record<string, string>>({});
  const [hFmt, setHFmt] = useState<HeaderFormat>("NONE");
  const [hText, setHText] = useState("");
  const [media, setMedia] = useState<Media>(null);
  const [uploading, setUploading] = useState(false);
  const [footer, setFooter] = useState("");
  const [buttons, setButtons] = useState<TplButton[]>([]);
  // layout + menus
  const [viewEd, setViewEd] = useState(false);
  const [showPv, setShowPv] = useState(false);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [sendFor, setSendFor] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<Tpl | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/templates", { cache: "no-store" });
    const data = (await res.json().catch(() => null)) as { templates?: Tpl[] } | null;
    setList(data?.templates ?? []);
    return data?.templates ?? [];
  }, []);
  useEffect(() => { void load().then((l) => { if (!startNew && l.length && window.matchMedia("(min-width: 768px)").matches) setSelId(l[0].id); }); }, [load, startNew]);

  const sel = creating ? null : list?.find((t) => t.id === selId) ?? null;
  const fill = (t: Tpl | null) => {
    setName(t?.name ?? ""); setBody(t?.body ?? "");
    setHFmt(t?.header_format ?? "NONE"); setHText(t?.header ?? ""); setFooter(t?.footer ?? ""); setButtons(t?.buttons_json ?? []);
    setMedia(t?.header_media_id ? { id: t.header_media_id, name: t.header_media_name ?? "file", mime: t.header_media_mime ?? "", url: `/api/media/${t.header_media_id}` } : null);
    setSamples(Object.fromEntries((t?.variables ?? []).map((v, i) => [String(i + 1), v])));
  };
  useEffect(() => { if (sel) fill(sel); }, [sel?.id, sel?.updated_at]);
  const startCreate = () => { setCreating(true); setSelId(null); fill(null); setNote(null); setCat("MARKETING"); setLang("en_IN"); setViewEd(true); };
  useEffect(() => {
    const h = () => startCreate();
    window.addEventListener("nbo:new-template", h); return () => window.removeEventListener("nbo:new-template", h);
  }, []);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const k = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("click", close); window.addEventListener("keydown", k); window.addEventListener("resize", close);
    return () => { window.removeEventListener("click", close); window.removeEventListener("keydown", k); window.removeEventListener("resize", close); };
  }, [menu]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: list?.length ?? 0, approved: 0, pending: 0, rejected: 0, draft: 0 };
    for (const t of list ?? []) c[t.status] = (c[t.status] ?? 0) + 1;
    return c;
  }, [list]);
  const shown = (list ?? []).filter((t) => (filter === "all" || t.status === filter) && (!q || t.name.toLowerCase().includes(q.toLowerCase()) || t.body.toLowerCase().includes(q.toLowerCase())));
  const status = creating ? "draft" : sel?.status ?? "draft";
  const editable = creating || status === "draft" || status === "rejected";
  const vars = tokensOf(body);
  const nameOk = /^[a-z0-9_]{3,64}$/.test(name);
  const qr = buttons.filter((b) => b.type === "QUICK_REPLY").length, urls = buttons.filter((b) => b.type === "URL").length, calls = buttons.filter((b) => b.type === "PHONE_NUMBER").length;
  const problems = [
    !nameOk && "a valid name",
    body.trim().length < 5 && "the message",
    hFmt === "TEXT" && !hText.trim() && "the header text",
    isMedia(hFmt) && !media && `a sample ${hFmt === "DOCUMENT" ? "PDF" : hFmt.toLowerCase()}`,
    buttons.some((b) => !b.text.trim()) && "button labels",
    buttons.some((b) => b.type === "URL" && !/^https?:\/\/\S+\.\S+/.test(b.url ?? "")) && "a full website link (https://…)",
    buttons.some((b) => b.type === "PHONE_NUMBER" && !/^\+?\d{8,15}$/.test((b.phone ?? "").replace(/[\s-]/g, ""))) && "a phone number with country code",
  ].filter(Boolean) as string[];
  const edgeVar = /^\s*\{\{\d+\}\}|\{\{\d+\}\}[.!?\s]*$/.test(body);
  const parts = () => ({
    headerFormat: hFmt, headerText: hFmt === "TEXT" ? hText.trim() : null, headerMediaId: isMedia(hFmt) ? media?.id ?? null : null,
    footer: footer.trim() || null, buttons: buttons.map((b) => b.type === "PHONE_NUMBER" ? { ...b, phone: (b.phone ?? "").replace(/[\s-]/g, "") } : b),
    variables: vars.map((n) => samples[n] || SAMPLE[n] || `value ${n}`),
  });
  const dirty = !!sel && JSON.stringify({ name, body, ...parts() }) !== JSON.stringify({
    name: sel.name, body: sel.body, headerFormat: sel.header_format, headerText: sel.header_format === "TEXT" ? sel.header : null, headerMediaId: isMedia(sel.header_format) ? sel.header_media_id : null,
    footer: sel.footer || null, buttons: sel.buttons_json ?? [], variables: vars.map((n) => sel.variables?.[+n - 1] || SAMPLE[n] || `value ${n}`),
  });

  async function act(fn: () => Promise<Response>, okText: string, after?: (d: { template?: Tpl; added?: number }) => void) {
    setBusy(true); setNote(null);
    try {
      const res = await fn();
      const d = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; template?: Tpl; updated?: number; added?: number } | null;
      if (!res.ok || !d?.ok) { setNote({ kind: "bad", text: d?.error ?? "Something went wrong — try again." }); if (d?.template) { await load(); setCreating(false); setSelId(d.template.id); } }
      else { setNote({ kind: "ok", text: okText.replace("{n}", String(d.updated ?? 0)) }); await load(); after?.(d); }
    } finally { setBusy(false); }
  }
  const json = (method: string, url: string, b?: unknown) => fetch(url, { method, headers: { "Content-Type": "application/json" }, body: b ? JSON.stringify(b) : undefined });
  const create = (submit: boolean) => act(() => json("POST", "/api/templates", { name, category: cat, language: lang, body, submit, ...parts() }),
    submit ? "Submitted to Meta — most reviews finish within an hour." : "Draft saved.", (d) => { setCreating(false); if (d.template) setSelId(d.template.id); });
  const save = () => sel && act(() => json("PATCH", `/api/templates/${sel.id}`, { name, body, ...parts() }), "Changes saved.");
  const submitT = (t: Tpl | null = sel) => t && act(async () => {
    if (t.id === sel?.id && dirty) { const r = await json("PATCH", `/api/templates/${t.id}`, { name, body, ...parts() }); if (!r.ok) return r; }
    return json("PATCH", `/api/templates/${t.id}`, { action: "submit" });
  }, "Submitted to Meta — most reviews finish within an hour.");
  const duplicate = (t: Tpl | null = sel) => t && act(() => json("PATCH", `/api/templates/${t.id}`, { action: "duplicate" }), "Copied as a new draft — edit it and submit.", (d) => { if (d.template) { setCreating(false); setSelId(d.template.id); setViewEd(true); } });
  const del = (t: Tpl) => act(() => json("DELETE", `/api/templates/${t.id}`), `Deleted ${t.name}.`, () => { setConfirmDel(null); if (selId === t.id) setSelId(null); });
  const sync = () => act(() => fetch("/api/templates/refresh", { method: "POST" }), "Synced with Meta — {n} updated.");

  async function upload(f: File) {
    setUploading(true); setNote(null);
    try {
      const fd = new FormData(); fd.set("file", f); fd.set("kind", hFmt);
      const r = await fetch("/api/media", { method: "POST", body: fd });
      const d = (await r.json().catch(() => null)) as { ok?: boolean; error?: string; media?: NonNullable<Media> } | null;
      if (!r.ok || !d?.media) setNote({ kind: "bad", text: d?.error ?? "Upload failed — try again." }); else setMedia(d.media);
    } finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  }
  function insertVar() {
    const el = bodyRef.current; const nextN = String((vars.map(Number).sort((a, b) => b - a)[0] ?? 0) + 1); const tok = `{{${nextN}}}`;
    const s = el?.selectionStart ?? body.length, e = el?.selectionEnd ?? body.length;
    setBody(body.slice(0, s) + tok + body.slice(e));
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(s + tok.length, s + tok.length); });
  }
  const addBtn = (type: TplButton["type"]) => setButtons([...buttons, type === "URL" ? { type, text: "Visit website", url: "" } : type === "PHONE_NUMBER" ? { type, text: "Call us", phone: "+91" } : { type, text: "" }]);
  const setBtn = (i: number, b: Partial<TplButton>) => setButtons(buttons.map((x, k) => (k === i ? { ...x, ...b } as TplButton : x)));

  const bubble = <WaBubble format={hFmt} headerText={hText} mediaUrl={media?.url ?? (sel ? tplMediaUrl(sel) : null)} mediaName={media?.name} body={body} values={samples} footer={footer} buttons={buttons} />;
  const preview = <Phone>{bubble}</Phone>;
  const curCat = sel?.category ?? cat;
  const pvMeta = (
    <div className="pv-meta">
      <div className="row"><span>Category</span><span className={`pill sm nodot ${curCat === "MARKETING" ? "info" : "neutral"}`}>{curCat === "MARKETING" ? "Marketing" : "Utility"}</span></div>
      <div className="row"><span>Can send to</span><span style={{ color: "var(--ink)" }}>{curCat === "MARKETING" ? "Opted-in contacts" : "Customers with an order or account"}</span></div>
      <div className="row"><span>Meta charges</span><span style={{ color: "var(--ink)" }}>{curCat === "MARKETING" ? "≈ ₹0.78 / message" : "≈ ₹0.12 / message"}</span></div>
    </div>
  );
  const menuT = menu ? list?.find((t) => t.id === menu.id) ?? null : null;
  const openMenu = (e: React.MouseEvent, t: Tpl) => {
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu(menu?.id === t.id ? null : { id: t.id, x: Math.min(r.right - 220, window.innerWidth - 232), y: r.bottom + 4 });
  };

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
            {list === null && <div className="col gap-6" style={{ padding: 10 }}>{[1, 2, 3].map((k) => <span key={k} className="sk" style={{ height: 84 }} />)}</div>}
            {list && shown.length === 0 && <div className="empty"><p>No templates match.</p></div>}
            {shown.map((t) => (
              <div key={t.id} className={`tcardi s-${t.status}${t.id === selId && !creating ? " on" : ""}`} data-testid="trow" role="button" tabIndex={0}
                onClick={() => { if (t.id !== selId || creating) setNote(null); setCreating(false); setSelId(t.id); setViewEd(true); setShowPv(false); }}
                onKeyDown={(e) => { if (e.key === "Enter") { setCreating(false); setSelId(t.id); setViewEd(true); } }}>
                <div className="tc-top">
                  <Thumb t={t} />
                  <b className="tc-nm">{t.name}</b>
                  <span className={`pill sm ${PILL[t.status]?.[0] ?? "neutral"}`}>{PILL[t.status]?.[1] ?? t.status}</span>
                  <button className="btn btn-ghost btn-icon btn-sm kebab" onClick={(e) => openMenu(e, t)} aria-label={`Actions for ${t.name}`} aria-haspopup="menu" aria-expanded={menu?.id === t.id} data-testid="tpl-kebab"><Icon name="dots-three-vertical" /></button>
                </div>
                <p className="tc-body">{t.header_format === "TEXT" && t.header ? <b>{t.header} · </b> : null}{t.body}</p>
                <div className="tc-foot">
                  <span>{t.category === "MARKETING" ? "Marketing" : "Utility"}</span><span>·</span><span>{(LANGS[t.language] ?? t.language).replace(/ \(.*\)/, "")}</span>
                  {(t.buttons_json?.length ?? 0) > 0 && <span className="tc-b" title={`${t.buttons_json.length} button${t.buttons_json.length > 1 ? "s" : ""}`}><Icon name="cursor-click" size="xs" />{t.buttons_json.length}</span>}
                  <span className="sp" /><span>{ago(t.updated_at)}</span>
                </div>
                {t.status === "rejected" && t.rejection_reason && <div className="tc-rej"><Icon name="warning-circle" size="xs" />{t.rejection_reason.replace(/_/g, " ").toLowerCase()}</div>}
              </div>
            ))}
          </div>
        </section>

        {menu && menuT && (
          <div className="menu" role="menu" style={{ position: "fixed", left: Math.max(8, menu.x), top: menu.y, width: 220 }} onClick={(e) => e.stopPropagation()} data-testid="tpl-menu">
            {menuT.status === "approved" && <>
              <button role="menuitem" onClick={() => { setSendFor(menuT.id); setMenu(null); }}><Icon name="paper-plane-tilt" />Send to a contact…</button>
              <a role="menuitem" href={`/broadcasts?new=1&tpl=${menuT.id}`}><Icon name="megaphone" />Use in a broadcast</a>
              <div className="sep" />
            </>}
            {(menuT.status === "draft" || menuT.status === "rejected") && <>
              <button role="menuitem" onClick={() => { setCreating(false); setSelId(menuT.id); setViewEd(true); setMenu(null); }}><Icon name="pencil-simple" />Edit</button>
              <button role="menuitem" onClick={() => { setMenu(null); void submitT(menuT); }}><Icon name="paper-plane-tilt" />{menuT.status === "rejected" ? "Resubmit to Meta" : "Submit to Meta"}</button>
            </>}
            <button role="menuitem" onClick={() => { setMenu(null); void duplicate(menuT); }}><Icon name="copy" />Duplicate</button>
            {menuT.status === "pending" && <button role="menuitem" onClick={() => { setMenu(null); void sync(); }}><Icon name="arrows-clockwise" />Check review status</button>}
            <div className="sep" />
            <button role="menuitem" className="danger" onClick={() => { setConfirmDel(menuT); setMenu(null); }} data-testid="tpl-delete"><Icon name="trash" />Delete…</button>
          </div>
        )}

        <section className="card ecard" data-status={status} id="ed">
          {!sel && !creating ? (
            <div className="empty" style={{ flex: 1 }}><img className="art-img" src="/art/templates.webp" alt="" width={112} height={112} /><h3>Pick a template</h3><p>Or create a new one to send after the 24-hour window or in broadcasts.</p><div className="acts"><button className="btn btn-primary" onClick={startCreate}><Icon name="plus" />New template</button></div></div>
          ) : (
            <>
              <header className="eh">
                <button className="btn btn-ghost btn-icon back" onClick={() => setViewEd(false)} aria-label="Back" data-testid="tedit-back"><Icon name="arrow-left" /></button>
                <span className="nm">{creating ? "New template" : sel!.name}</span>
                {!creating && <span className={`pill sm ${PILL[status]?.[0] ?? "neutral"}`}>{PILL[status]?.[1] ?? status}</span>}
                <span className="sp" />
                <button className="btn btn-soft btn-sm pvtoggle" onClick={() => setShowPv((v) => !v)} data-testid="tpl-preview-toggle"><Icon name="device-mobile" />{showPv ? "Edit" : "Preview"}</button>
                {sel?.status === "approved" && <button className="btn btn-soft btn-sm" onClick={() => setSendFor(sel.id)} data-testid="tpl-send-one"><Icon name="paper-plane-tilt" />Send to a contact</button>}
              </header>
              <div className="eb">
                {note && <div className={`note ${note.kind}`} data-testid="tpl-note"><Icon name={note.kind === "ok" ? "check-circle" : "warning-circle"} /><span>{note.text}</span></div>}
                {!creating && status === "approved" && <div className="sbanner sb-approved"><Icon name="seal-check" /><div><b>Approved by Meta</b><p>Ready for broadcasts and for restarting closed chats. To change it, duplicate it and submit the copy for review.</p></div></div>}
                {!creating && status === "pending" && <div className="sbanner sb-pending"><Icon name="hourglass" /><div><b>In review with Meta</b><p>Submitted {ago(sel!.updated_at)}. Most templates are reviewed within an hour; some take up to 24 hours. We check automatically.</p></div></div>}
                {!creating && status === "rejected" && <div className="sbanner sb-rejected"><Icon name="warning-circle" /><div style={{ flex: 1 }}><b>Rejected by Meta</b><p>{sel!.rejection_reason ? `Reason: ${sel!.rejection_reason.replace(/_/g, " ").toLowerCase()}` : "Meta didn't share a reason."}</p>
                  <div className="rejbox"><span><b style={{ display: "inline", color: "var(--ink)" }}>How to fix:</b> the most common causes are a category that doesn&apos;t match the content (offers must be Marketing), variables at the very start or end of the message, or missing sample values. Edit below and resubmit.</span></div></div></div>}
                {(creating || status === "draft") && <div className="sbanner sb-draft"><Icon name="note-pencil" /><div><b>{creating ? "New draft" : "Draft — not submitted"}</b><p>Only approved templates can be sent. Submit when ready; review usually takes under an hour.</p></div></div>}

                <div className="blk"><div className="blk-h"><b>Basics</b></div><div className="blk-b"><div className="g3">
                  <div className="field"><label htmlFor="tpl-name">Name</label><input id="tpl-name" className={`input mono${name && !nameOk ? " err" : ""}`} value={name} onChange={(e) => setName(e.target.value.toLowerCase().replace(/\s+/g, "_"))} readOnly={!editable} placeholder="order_update" /><span className={`hint${name && !nameOk ? " err" : ""}`}>lowercase_with_underscores, 3–64 characters</span></div>
                  <div className="field"><label htmlFor="tpl-cat">Category</label>{creating ? <select id="tpl-cat" className="select" value={cat} onChange={(e) => setCat(e.target.value as "MARKETING" | "UTILITY")}><option value="MARKETING">Marketing</option><option value="UTILITY">Utility</option></select> : <div className="input" style={{ display: "flex", alignItems: "center", background: "var(--bg)" }}>{sel!.category === "MARKETING" ? "Marketing" : "Utility"}</div>}<span className="hint">Offers &amp; follow-ups = Marketing</span></div>
                  <div className="field"><label htmlFor="tpl-lang">Language</label>{creating ? <select id="tpl-lang" className="select" value={lang} onChange={(e) => setLang(e.target.value)}>{Object.entries(LANGS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select> : <div className="input" style={{ display: "flex", alignItems: "center", background: "var(--bg)" }}>{LANGS[sel!.language] ?? sel!.language}</div>}</div>
                </div></div></div>

                <div className="blk" data-testid="tpl-header"><div className="blk-h"><b>Header</b><small>optional · shows above the message</small></div>
                  <div className="blk-b">
                    <div className="seg hseg" role="radiogroup" aria-label="Header type">
                      {HEADERS.map(([k, l, ic]) => <button key={k} role="radio" aria-checked={hFmt === k} className={hFmt === k ? "on" : ""} disabled={!editable} onClick={() => { setHFmt(k); if (k !== hFmt) setMedia(null); }} data-testid={`hdr-${k}`}><Icon name={ic} size="sm" />{l}</button>)}
                    </div>
                    {hFmt === "TEXT" && <div className="field"><input className="input" value={hText} onChange={(e) => setHText(e.target.value.slice(0, 60))} readOnly={!editable} placeholder="Diwali offer 🪔" aria-label="Header text" data-testid="hdr-text" /><span className="hint">{hText.length} / 60</span></div>}
                    {isMedia(hFmt) && (
                      <div className={`drop${media ? " has" : ""}`} onDragOver={(e) => { if (editable) e.preventDefault(); }} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f && editable) void upload(f); }}>
                        {media ? (
                          <>
                            {hFmt === "IMAGE" ? <img src={media.url} alt="" /> : hFmt === "VIDEO" ? <video src={media.url} muted playsInline controls /> : <span className="icon-tile"><Icon name="file-pdf" /></span>}
                            <span className="grow trunc"><b>{media.name}</b><small>Sample for Meta&apos;s review — also sent with every message</small></span>
                            {editable && <button className="btn btn-soft btn-sm" onClick={() => fileRef.current?.click()} disabled={uploading}>{uploading ? "Uploading…" : "Replace"}</button>}
                          </>
                        ) : (
                          <button className="drop-in" onClick={() => fileRef.current?.click()} disabled={!editable || uploading} data-testid="hdr-upload">
                            <Icon name="upload-simple" /><b>{uploading ? "Uploading…" : `Upload ${hFmt === "DOCUMENT" ? "a PDF" : `an ${hFmt === "IMAGE" ? "image" : "video"}`}`}</b><small>{LIMIT[hFmt]} · or drop it here</small>
                          </button>
                        )}
                        <input ref={fileRef} type="file" hidden accept={ACCEPT[hFmt]} onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} data-testid="hdr-file" />
                      </div>
                    )}
                    {!editable && isMedia(hFmt) && !media && <p className="xs faint">This template was created in Meta&apos;s tools, so we don&apos;t have its header file. Duplicate it here and upload the file to send it.</p>}
                  </div></div>

                <div className="blk"><div className="blk-h"><b>Message</b><small>what the customer reads</small></div>
                  <div className="blk-b">
                    <div className="body-ed" data-testid="tpl-body">
                      <div className="tb">
                        <button className="btn btn-ghost btn-sm" style={{ color: "var(--grape-deep)" }} onClick={insertVar} disabled={!editable}><Icon name="brackets-curly" />Add variable</button>
                        <span className="cnt">{body.length} / 1024</span>
                      </div>
                      <textarea ref={bodyRef} className="txt" style={{ width: "100%", border: 0, resize: "vertical", minHeight: 120, background: "transparent", fontFamily: "inherit" }} value={body} onChange={(e) => setBody(e.target.value.slice(0, 1024))} readOnly={!editable} data-testid="tpl-body-input" placeholder="Hi {{1}}! Your order is ready for pickup." aria-label="Message body" />
                    </div>
                    {editable && edgeVar && <div className="note warn" style={{ fontSize: "var(--fs-xs)" }}><Icon name="warning" size="sm" /><span>Meta rejects messages that start or end with a variable — add a few words before or after it.</span></div>}
                    {vars.length > 0 && (
                      <>
                        <div className="eyebrow">Sample values <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 600 }}>— Meta needs these to review</span></div>
                        <div className="samples">{vars.map((n) => (
                          <div key={n} style={{ display: "contents" }}><span className="v">{`{{${n}}}`}</span><input className="input" value={samples[n] ?? SAMPLE[n] ?? ""} onChange={(e) => setSamples({ ...samples, [n]: e.target.value })} readOnly={!editable} aria-label={`Sample value for variable ${n}`} /></div>
                        ))}</div>
                      </>
                    )}
                  </div></div>

                <div className="blk"><div className="blk-h"><b>Footer</b><small>optional · small grey line</small></div>
                  <div className="blk-b"><div className="field"><input className="input" value={footer} onChange={(e) => setFooter(e.target.value.slice(0, 60))} readOnly={!editable} placeholder="Reply STOP to unsubscribe" aria-label="Footer" data-testid="tpl-footer" /><span className="hint">{footer.length} / 60</span></div></div></div>

                <div className="blk" data-testid="tpl-buttons"><div className="blk-h"><b>Buttons</b><small>optional · up to 10</small></div>
                  <div className="blk-b">
                    {buttons.map((b, i) => (
                      <div key={i} className="btnrow" data-testid="tpl-btn">
                        <span className={`icon-tile sm ${b.type === "URL" ? "orange" : b.type === "PHONE_NUMBER" ? "green" : "grape"}`}><Icon name={b.type === "URL" ? "link" : b.type === "PHONE_NUMBER" ? "phone" : "arrow-counter-clockwise"} /></span>
                        <span className="bt-k">{b.type === "URL" ? "Website" : b.type === "PHONE_NUMBER" ? "Call" : "Quick reply"}</span>
                        <input className="input" value={b.text} onChange={(e) => setBtn(i, { text: e.target.value.slice(0, 25) })} readOnly={!editable} placeholder={b.type === "QUICK_REPLY" ? "e.g. Yes, interested" : "Button label"} aria-label="Button label" />
                        {b.type === "URL" && <input className="input" value={b.url ?? ""} onChange={(e) => setBtn(i, { url: e.target.value })} readOnly={!editable} placeholder="https://yourshop.com" aria-label="Website link" />}
                        {b.type === "PHONE_NUMBER" && <input className="input" value={b.phone ?? ""} onChange={(e) => setBtn(i, { phone: e.target.value })} readOnly={!editable} placeholder="+91 98765 43210" aria-label="Phone number" />}
                        {editable && <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setButtons(buttons.filter((_, k) => k !== i))} aria-label="Remove button"><Icon name="x" /></button>}
                      </div>
                    ))}
                    {editable && buttons.length < 10 && (
                      <div className="row gap-6 wrap">
                        <button className="btn btn-soft btn-sm" onClick={() => addBtn("QUICK_REPLY")} data-testid="add-qr"><Icon name="plus" />Quick reply</button>
                        <button className="btn btn-soft btn-sm" onClick={() => addBtn("URL")} disabled={urls >= 2} data-testid="add-url"><Icon name="link" />Website</button>
                        <button className="btn btn-soft btn-sm" onClick={() => addBtn("PHONE_NUMBER")} disabled={calls >= 1}><Icon name="phone" />Call</button>
                      </div>
                    )}
                    {!buttons.length && !editable && <p className="xs faint">No buttons.</p>}
                    {qr > 0 && <p className="xs faint" style={{ fontWeight: 600 }}>Quick-reply taps arrive in your inbox as the customer&apos;s message — and they open the 24-hour window.</p>}
                  </div></div>
                <div className="pv-inline" style={{ flexDirection: "column", alignItems: "center", gap: 14 }}>{preview}{pvMeta}</div>
              </div>
              <footer className="ef">
                <span className="xs faint grow" style={{ fontWeight: 600 }}>{editable && problems.length ? `Still needed: ${problems.join(", ")}` : creating ? "New templates are reviewed by Meta before you can send them." : `Updated ${ago(sel!.updated_at)}`}</span>
                {creating ? (
                  <>
                    <button className="btn btn-soft" onClick={() => setCreating(false)}>Cancel</button>
                    <button className="btn btn-soft" disabled={busy || !nameOk || body.trim().length < 5} onClick={() => void create(false)}>Save draft</button>
                    <button className="btn btn-primary" disabled={busy || problems.length > 0 || uploading} onClick={() => void create(true)} data-testid="tpl-submit"><Icon name="paper-plane-tilt" />Submit for review</button>
                  </>
                ) : editable ? (
                  <>
                    <button className="btn btn-soft" disabled={busy || !dirty || !nameOk} onClick={() => void save()}>Save draft</button>
                    <button className="btn btn-primary" disabled={busy || problems.length > 0 || uploading} onClick={() => void submitT()} data-testid="tpl-submit"><Icon name="paper-plane-tilt" />{status === "rejected" ? "Resubmit" : "Submit for review"}</button>
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
            <img className="art-img" src="/art/templates.webp" alt="" width={150} height={150} />
            <h3>Templates let you message customers any time</h3>
            <p>WhatsApp only allows free-form replies for 24 hours after a customer writes. After that, and for broadcasts, you need a template that Meta has approved.</p>
            <div className="acts"><button className="btn btn-primary" onClick={startCreate}><Icon name="plus" />Create a template</button><button className="btn btn-soft" onClick={() => void sync()}><Icon name="arrows-clockwise" />Sync from Meta</button></div>
          </div>
        </section>
      </div>

      <TemplateSendModal open={!!sendFor} templateId={sendFor} onClose={() => setSendFor(null)} />
      {confirmDel && (
        <div className="modal-scrim" onClick={() => setConfirmDel(null)}>
          <div className="card modal sm" role="alertdialog" aria-modal="true" aria-label="Delete template" onClick={(e) => e.stopPropagation()} data-testid="tpl-del-confirm">
            <div style={{ padding: "var(--pad)", display: "flex", flexDirection: "column", gap: 10 }}>
              <span className="icon-tile red"><Icon name="trash" /></span>
              <b style={{ fontSize: "var(--fs-md)" }}>Delete {confirmDel.name}?</b>
              <p className="small muted">{confirmDel.status === "draft" ? "This draft will be removed." : "It's also deleted from your WhatsApp account on Meta. Meta doesn't let you reuse this name for 30 days."}</p>
              <div className="row gap-6" style={{ justifyContent: "flex-end" }}>
                <button className="btn btn-soft" onClick={() => setConfirmDel(null)}>Cancel</button>
                <button className="btn btn-danger" disabled={busy} onClick={() => void del(confirmDel)} data-testid="tpl-del-yes">Delete</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
