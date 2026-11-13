"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/Icon";

/**
 * Automation — design v2 (nextbiz-one-v2/automation). Welcome message · keyword replies (+ editor drawer) ·
 * test console · business hours + away message · saved answers (FAQ) · hand-off explainer.
 * v1 locks kept: contains-match keywords only, no AI, automation pauses per chat after a human reply.
 */
type Rule = { id: string; name: string; keywords: string[]; reply: string; enabled: boolean; send_once: boolean; fired_count: number; last_fired_at: string | null;
  on_whatsapp: boolean; on_instagram_dm: boolean; on_instagram_comment: boolean; comment_public_reply: string | null };
type Settings = { welcome_enabled: boolean; welcome_text: string; away_enabled: boolean; away_text: string | null; business_hours: Record<string, [string, string]> } | null;
type Faq = { id: string; question: string; answer: string };
type LogRow = { type: string; status: string; created_at: string; rule_id: string | null };
type Draft = { id?: string; name: string; keywords: string[]; reply: string; enabled: boolean; sendOnce: boolean;
  onWhatsapp: boolean; onInstagramDm: boolean; onInstagramComment: boolean; commentPublicReply: string };
const NEW_DRAFT = (over: Partial<Draft> = {}): Draft => ({ name: "", keywords: [], reply: "", enabled: true, sendOnce: true, onWhatsapp: true, onInstagramDm: false, onInstagramComment: false, commentPublicReply: "", ...over });
const toDraft = (r: Rule): Draft => ({ id: r.id, name: r.name, keywords: r.keywords, reply: r.reply, enabled: r.enabled, sendOnce: r.send_once,
  onWhatsapp: r.on_whatsapp ?? true, onInstagramDm: !!r.on_instagram_dm, onInstagramComment: !!r.on_instagram_comment, commentPublicReply: r.comment_public_reply ?? "" });

const DAYS: [string, string][] = [["mon", "Mon"], ["tue", "Tue"], ["wed", "Wed"], ["thu", "Thu"], ["fri", "Fri"], ["sat", "Sat"], ["sun", "Sun"]];
const TILES = ["green", "banana", "grape", "pink", "orange"];
const toH = (t: string) => { const [h, m] = t.split(":").map(Number); return h + (m || 0) / 60; };
const fmtH = (t: string) => { const [h, m] = t.split(":").map(Number); const ap = h >= 12 ? "p" : "a"; const hh = h % 12 || 12; return `${hh}${m ? ":" + String(m).padStart(2, "0") : ""}${ap}`; };
const json = (method: string, url: string, b?: unknown) => fetch(url, { method, headers: { "Content-Type": "application/json" }, body: b === undefined ? undefined : JSON.stringify(b) }).then((r) => r.json().catch(() => null));

export function AutomationClient() {
  const [settings, setSettings] = useState<Settings>(null);
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [faq, setFaq] = useState<Faq[]>([]);
  const [log, setLog] = useState<LogRow[]>([]);
  const [tab, setTab] = useState<"all" | "on" | "off">("all");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [kwInput, setKwInput] = useState("");
  const [welcomeEdit, setWelcomeEdit] = useState<string | null>(null);
  const [hoursEdit, setHoursEdit] = useState<{ hours: Record<string, [string, string]>; away: string } | null>(null);
  const [testText, setTestText] = useState("");
  const [testRes, setTestRes] = useState<{ matched: boolean; rule: string | null; keyword: string | null } | null>(null);
  const [faqDraft, setFaqDraft] = useState<{ q: string; a: string } | null>(null);
  const [note, setNote] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const d = await fetch("/api/automation", { cache: "no-store" }).then((x) => x.json()).catch(() => null);
    if (d?.ok) { setSettings(d.settings); setRules(d.rules ?? []); setFaq(d.faq ?? []); setLog(d.log ?? []); }
    else setRules([]);
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (note) { const t = setTimeout(() => setNote(null), 3500); return () => clearTimeout(t); } }, [note]);
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && setDraft(null); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, []);

  const flash = (ok: boolean, text: string) => setNote({ kind: ok ? "ok" : "bad", text });
  async function putSettings(b: Record<string, unknown>, ok = "Saved") {
    setBusy(true); const d = await json("PUT", "/api/automation/settings", b); setBusy(false);
    flash(!!d?.ok, d?.ok ? ok : d?.error ?? "Couldn't save"); if (d?.ok) await load(); return !!d?.ok;
  }
  async function saveRule() {
    if (!draft) return;
    const kws = [...draft.keywords, ...(kwInput.trim() ? [kwInput.trim()] : [])];
    if (!draft.name.trim() || kws.length === 0 || !draft.reply.trim()) { flash(false, "Add a name, at least one keyword and a reply."); return; }
    let d;
    if (!draft.onWhatsapp && !draft.onInstagramDm && !draft.onInstagramComment) { flash(false, "Pick at least one place this reply should run."); return; }
    const ch = { onWhatsapp: draft.onWhatsapp, onInstagramDm: draft.onInstagramDm, onInstagramComment: draft.onInstagramComment, commentPublicReply: draft.onInstagramComment ? draft.commentPublicReply.trim() || null : null };
    setBusy(true);
    if (draft.id) d = await json("PATCH", `/api/automation/rules/${draft.id}`, { name: draft.name, keywords: kws, reply: draft.reply, enabled: draft.enabled, sendOnce: draft.sendOnce, ...ch });
    else d = await json("POST", "/api/automation/rules", { name: draft.name, keywords: kws, reply: draft.reply, enabled: draft.enabled, sendOnce: draft.sendOnce, ...ch });
    setBusy(false);
    flash(!!d?.ok, d?.ok ? "Keyword reply saved" : d?.error ?? "Couldn't save");
    if (d?.ok) { setDraft(null); setKwInput(""); await load(); }
  }
  async function deleteRule() {
    if (!draft?.id) return;
    setBusy(true); const d = await json("DELETE", `/api/automation/rules/${draft.id}`); setBusy(false);
    flash(!!d?.ok, d?.ok ? "Keyword reply deleted" : "Couldn't delete"); if (d?.ok) { setDraft(null); await load(); }
  }
  async function toggleRule(r: Rule) { await json("PATCH", `/api/automation/rules/${r.id}`, { enabled: !r.enabled }); await load(); }
  async function runTest() {
    if (!testText.trim()) return;
    const d = await json("POST", "/api/automation/rules/test", { text: testText });
    setTestRes(d ? { matched: !!d.matched, rule: d.rule, keyword: d.keyword } : null);
  }
  async function addFaq() {
    if (!faqDraft) return;
    const d = await json("POST", "/api/automation/faq", { question: faqDraft.q, answer: faqDraft.a });
    flash(!!d?.ok, d?.ok ? "Saved answer added" : d?.error ?? "Add a question (3+ characters) and an answer"); if (d?.ok) { setFaqDraft(null); await load(); }
  }
  async function delFaq(id: string) { await json("DELETE", `/api/automation/faq/${id}`); await load(); }

  const shown = (rules ?? []).filter((r) => tab === "all" || (tab === "on" ? r.enabled : !r.enabled));
  const hours = settings?.business_hours ?? {};
  const welcomeCount = log.filter((l) => l.type === "welcome").length;
  const nowIst = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const todayKey = DAYS[(nowIst.getDay() + 6) % 7][0];
  const nowH = nowIst.getHours() + nowIst.getMinutes() / 60;
  const openNow = !!hours[todayKey] && nowH >= toH(hours[todayKey][0]) && nowH < toH(hours[todayKey][1]);
  const ruleOf = (id: string) => (rules ?? []).find((r) => r.id === id);
  const matched = testRes?.matched && testRes.rule ? (rules ?? []).find((r) => r.name === testRes.rule) : null;

  return (
    <div className="pg-automation">
      <div className="page" data-testid="automation">
        <div className="note info" style={{ background: "var(--surface)", border: "1px solid var(--line)", boxShadow: "var(--shadow-1)", color: "var(--ink-2)", padding: "12px 14px" }}>
          <span className="icon-tile sm grape"><Icon name="hand" /></span>
          <span style={{ flex: 1 }}><b>Automation steps aside when you reply.</b> On WhatsApp and Instagram, the moment you answer a chat yourself, auto-replies pause for that conversation — customers never get a bot reply in the middle of your conversation.</span>
        </div>
        <div className="cols">
          <div className="stackc">
            <section className="card">
              <div className="rule-h"><span className="icon-tile green"><Icon name="hand" /></span>
                <span className="grow"><b>Welcome message</b><small>Sent once, the first time someone messages you</small></span>
                <button className={`tog${settings?.welcome_enabled ? " on" : ""}`} role="switch" aria-checked={!!settings?.welcome_enabled} aria-label="Welcome message" onClick={() => void putSettings({ welcomeEnabled: !settings?.welcome_enabled }, settings?.welcome_enabled ? "Welcome message off" : "Welcome message on")} data-testid="welcome-toggle" /></div>
              {welcomeEdit === null ? (
                <div className="convo"><div className="b-in">Hi, I need a website for my bakery</div>
                  <div className="b-out"><span className="tag-auto"><Icon name="lightning" size="xs" />Auto-reply</span>{settings?.welcome_text ?? "Hi! Thanks for reaching out — we usually reply within a day."}</div></div>
              ) : (
                <div style={{ padding: "0 var(--pad)" }}><textarea className="textarea" rows={4} value={welcomeEdit} onChange={(e) => setWelcomeEdit(e.target.value.slice(0, 1024))} aria-label="Welcome message text" autoFocus /><span className="hint">{welcomeEdit.length} / 1024</span></div>
              )}
              <div className="rstats"><span><b>{welcomeCount}</b> sent recently</span><span>{settings?.welcome_enabled ? "On" : "Off"}</span><span className="sp" />
                {welcomeEdit === null
                  ? <button className="btn btn-soft btn-sm" onClick={() => setWelcomeEdit(settings?.welcome_text ?? "")}><Icon name="pencil-simple" />Edit message</button>
                  : <><button className="btn btn-ghost btn-sm" onClick={() => setWelcomeEdit(null)}>Cancel</button><button className="btn btn-primary btn-sm" disabled={busy || !welcomeEdit.trim()} onClick={async () => { if (await putSettings({ welcomeText: welcomeEdit }, "Welcome message saved")) setWelcomeEdit(null); }}>Save</button></>}
              </div>
            </section>

            <section className="card">
              <div className="card-h"><span className="h3">Keyword replies</span>
                <div className="seg">{(["all", "on", "off"] as const).map((t) => <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{t === "all" ? "All" : t === "on" ? "On" : "Off"} {t === "all" ? rules?.length ?? 0 : (rules ?? []).filter((r) => (t === "on") === r.enabled).length}</button>)}</div></div>
              {rules && rules.length === 0 ? (
                <div className="empty"><div className="art"><Icon name="lightning" /></div><h3>Answer common questions instantly</h3><p>Reply automatically when a message contains words like “price”, “timing” or “address”.</p>
                  <div className="acts"><button className="btn btn-primary" onClick={() => setDraft(NEW_DRAFT({ name: "Price inquiries", keywords: ["price", "cost", "rate"] }))}><Icon name="plus" />Add keyword reply</button></div></div>
              ) : (
                <>
                  <div className="khead"><span /><span>When message contains</span><span>Reply</span><span style={{ textAlign: "right" }}>Fired</span><span /></div>
                  <div className="kw dtable">
                    {shown.map((r, i) => (
                      <div key={r.id} className={`kr${r.enabled ? "" : " off"}${draft?.id === r.id ? " on" : ""}`} onClick={() => setDraft(toDraft(r))} role="button" tabIndex={0}>
                        <span className={`icon-tile sm ${TILES[i % TILES.length]}`}><Icon name="lightning" /></span>
                        <span className="nm"><b className="row gap-4" style={{ display: "flex" }}>{r.name}
                          {r.on_whatsapp !== false && <Icon name="whatsapp-logo" size="xs" style={{ color: "#1E8E3E" }} title="WhatsApp" />}
                          {r.on_instagram_dm && <Icon name="instagram-logo" size="xs" style={{ color: "var(--social-deep)" }} title="Instagram DMs" />}
                          {r.on_instagram_comment && <Icon name="chat-text" size="xs" style={{ color: "var(--social-deep)" }} title="Instagram comments" />}</b><span className="row gap-4">{r.keywords.slice(0, 2).map((k) => <span key={k} className="tag">{k}</span>)}{r.keywords.length > 2 && <span className="tag">+{r.keywords.length - 2}</span>}</span></span>
                        <span className="rp">{r.reply}</span>
                        <span className="hits">{r.fired_count}<small>times</small></span>
                        <button className={`tog${r.enabled ? " on" : ""}`} role="switch" aria-checked={r.enabled} aria-label={`${r.name} on/off`} onClick={(e) => { e.stopPropagation(); void toggleRule(r); }} />
                      </div>
                    ))}
                  </div>
                  <div className="card-f"><span className="xs faint grow" style={{ fontWeight: 600 }}>First match wins · not case-sensitive</span><button className="btn btn-soft btn-sm" onClick={() => setDraft(NEW_DRAFT())} data-testid="add-rule"><Icon name="plus" />Add keyword reply</button></div>
                </>
              )}
            </section>

            <section className="card">
              <div className="card-h"><span className="h3">Saved answers</span><span className="pill neutral sm nodot">Suggested, not auto-sent</span><button className="btn btn-soft btn-sm" onClick={() => setFaqDraft({ q: "", a: "" })}><Icon name="plus" />Add</button></div>
              <div className="card-b col gap-6" style={{ paddingTop: 0 }}>
                {faq.length === 0 && !faqDraft && <p className="xs faint" style={{ fontWeight: 600 }}>Save answers to questions you get often — reuse them when replying.</p>}
                {faq.map((f) => (
                  <div key={f.id} className="well" style={{ padding: "10px 12px", display: "flex", gap: 10, alignItems: "flex-start" }}><span className="grow"><b className="small">{f.question}</b><div className="xs muted" style={{ marginTop: 2 }}>{f.answer}</div></span><button className="btn btn-ghost btn-icon btn-sm" onClick={() => void delFaq(f.id)} aria-label="Delete saved answer"><Icon name="trash" /></button></div>
                ))}
                {faqDraft && (
                  <div className="col gap-6"><input className="input" placeholder="Question — e.g. Do you deliver?" value={faqDraft.q} onChange={(e) => setFaqDraft({ ...faqDraft, q: e.target.value })} aria-label="Question" />
                    <textarea className="textarea" rows={2} placeholder="Answer" value={faqDraft.a} onChange={(e) => setFaqDraft({ ...faqDraft, a: e.target.value })} aria-label="Answer" />
                    <div className="row" style={{ justifyContent: "flex-end" }}><button className="btn btn-ghost btn-sm" onClick={() => setFaqDraft(null)}>Cancel</button><button className="btn btn-primary btn-sm" onClick={() => void addFaq()}>Save answer</button></div></div>
                )}
              </div>
            </section>
          </div>

          <div className="stackc side">
            <section className="card">
              <div className="rule-h"><span className="icon-tile grape"><Icon name="flask" /></span><span className="grow"><b>Test your replies</b><small>Type what a customer might say. Nothing is sent.</small></span></div>
              <form className="test" onSubmit={(e) => { e.preventDefault(); void runTest(); }}>
                <div className="row gap-6"><input className="input" value={testText} onChange={(e) => setTestText(e.target.value)} placeholder="what's the price for a 5 page site?" aria-label="Test message" data-testid="rule-test-input" /><button className="btn btn-dark" disabled={!testText.trim()}>Test</button></div>
                {testRes && (
                  <div className="result" data-testid="rule-test-result">
                    {testRes.matched ? <><span className="h"><Icon name="check-circle-fill" size="sm" />Matches “{testRes.rule}” · keyword “{testRes.keyword}”</span>{matched && <div className="b-out" style={{ maxWidth: "100%", alignSelf: "stretch" }}>{matched.reply}</div>}</>
                      : <><span className="h" style={{ color: "var(--ink-2)" }}><Icon name="info" size="sm" />No keyword matched</span><span className="xs muted">The message waits in your inbox for you to reply.</span></>}
                  </div>
                )}
              </form>
            </section>

            <section className="card">
              <div className="rule-h"><span className="icon-tile"><Icon name="clock" /></span><span className="grow"><b>Business hours</b><small>Outside these hours, send an away message</small></span>
                <button className={`tog${settings?.away_enabled ? " on" : ""}`} role="switch" aria-checked={!!settings?.away_enabled} aria-label="Away message" onClick={() => void putSettings({ awayEnabled: !settings?.away_enabled }, settings?.away_enabled ? "Away message off" : "Away message on")} /></div>
              {hoursEdit === null ? (
                <>
                  <div className="hours">
                    {DAYS.map(([k, l]) => { const h = hours[k]; return (
                      <div key={k} className={`hr${h ? "" : " closed"}`}><span>{l}</span><div className="track">{h && <span style={{ left: `${(toH(h[0]) / 24) * 100}%`, width: `${((toH(h[1]) - toH(h[0])) / 24) * 100}%` }}>{fmtH(h[0])}–{fmtH(h[1])}</span>}{k === todayKey && <i className="now" style={{ left: `${(nowH / 24) * 100}%` }} />}</div></div>); })}
                  </div>
                  <div className="ticks"><span /><div><span>12a</span><span>6a</span><span>12p</span><span>6p</span><span>12a</span></div></div>
                  <div style={{ padding: "12px var(--pad) var(--pad)" }}>
                    <div className="well" style={{ padding: "10px 12px", fontSize: "var(--fs-sm)", lineHeight: 1.5 }}><b style={{ fontSize: "var(--fs-xs)" }}>Away message</b><br />{settings?.away_text || <span className="faint">Not set yet</span>}</div>
                    <div className="row" style={{ marginTop: 10 }}><span className="xs faint grow" style={{ fontWeight: 600 }}>India time · now {Object.keys(hours).length ? (openNow ? <b style={{ color: "var(--chat-deep)" }}>open</b> : <b>closed</b>) : "no hours set"}</span>
                      <button className="btn btn-soft btn-sm" onClick={() => setHoursEdit({ hours: { ...hours }, away: settings?.away_text ?? "" })}>Edit hours</button></div>
                  </div>
                </>
              ) : (
                <div className="col gap-6" style={{ padding: "0 var(--pad) var(--pad)" }}>
                  {DAYS.map(([k, l]) => { const h = hoursEdit.hours[k]; return (
                    <div key={k} className="row gap-6"><button className={`tog${h ? " on" : ""}`} role="switch" aria-checked={!!h} aria-label={`${l} open`} onClick={() => { const n = { ...hoursEdit.hours }; if (h) delete n[k]; else n[k] = ["10:00", "19:00"]; setHoursEdit({ ...hoursEdit, hours: n }); }} />
                      <span className="small" style={{ width: 34, fontWeight: 700 }}>{l}</span>
                      {h ? <><input type="time" className="input" style={{ height: 32 }} value={h[0]} onChange={(e) => setHoursEdit({ ...hoursEdit, hours: { ...hoursEdit.hours, [k]: [e.target.value, h[1]] } })} aria-label={`${l} opens`} /><span className="faint">–</span><input type="time" className="input" style={{ height: 32 }} value={h[1]} onChange={(e) => setHoursEdit({ ...hoursEdit, hours: { ...hoursEdit.hours, [k]: [h[0], e.target.value] } })} aria-label={`${l} closes`} /></> : <span className="xs faint" style={{ fontWeight: 600 }}>Closed</span>}</div>); })}
                  <label className="label" style={{ marginTop: 6 }} htmlFor="away-text">Away message</label>
                  <textarea id="away-text" className="textarea" rows={3} value={hoursEdit.away} onChange={(e) => setHoursEdit({ ...hoursEdit, away: e.target.value.slice(0, 1024) })} placeholder="Thanks for messaging! We're closed right now — we'll reply first thing in the morning." />
                  <div className="row" style={{ justifyContent: "flex-end" }}><button className="btn btn-ghost btn-sm" onClick={() => setHoursEdit(null)}>Cancel</button>
                    <button className="btn btn-primary btn-sm" disabled={busy} onClick={async () => { if (await putSettings({ businessHours: hoursEdit.hours, awayText: hoursEdit.away || null }, "Business hours saved")) setHoursEdit(null); }}>Save hours</button></div>
                </div>
              )}
            </section>

            <section className="card">
              <div className="rule-h"><span className="icon-tile banana"><Icon name="clock-countdown" /></span><span className="grow"><b>Recent automatic replies</b><small>What automation sent lately</small></span></div>
              <div className="handoff">
                {log.length === 0 && <p className="xs faint" style={{ fontWeight: 600 }}>Nothing sent automatically yet.</p>}
                {log.slice(0, 6).map((l, i) => (
                  <div key={i} className="hrow"><span className={`icon-tile sm ${l.type === "welcome" ? "green" : l.type === "away" ? "neutral" : "grape"}`}><Icon name={l.type === "welcome" ? "hand" : l.type === "away" ? "clock" : "lightning"} /></span>
                    <span className="grow">{l.type === "welcome" ? "Welcome message" : l.type === "away" ? "Away message" : ruleOf(l.rule_id ?? "")?.name ?? "Keyword reply"}<small>{new Date(l.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</small></span>
                    <span className={`pill sm ${l.status === "sent" ? "ok" : l.status === "failed" ? "bad" : "neutral"}`}>{l.status}</span></div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>

      <div className={`scrim${draft ? " open" : ""}`} onClick={() => setDraft(null)} />
      <aside className={`drawer${draft ? " open" : ""}`} aria-label="Keyword reply" aria-hidden={!draft}>
        {draft && (
          <>
            <div className="dh"><span className="icon-tile lg grape"><Icon name="lightning" /></span><div className="grow"><h2>{draft.id ? draft.name || "Keyword reply" : "New keyword reply"}</h2><div className="small muted" style={{ fontWeight: 600 }}>{draft.enabled ? "On" : "Off"}</div></div>
              <button className={`tog${draft.enabled ? " on" : ""}`} style={{ marginTop: 6 }} role="switch" aria-checked={draft.enabled} aria-label="Rule on/off" onClick={() => setDraft({ ...draft, enabled: !draft.enabled })} />
              <button className="btn btn-ghost btn-icon" onClick={() => setDraft(null)} aria-label="Close"><Icon name="x" /></button></div>
            <div className="db">
              <div className="field"><label htmlFor="rule-name">Name <span className="opt">only you see this</span></label><input id="rule-name" className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Price inquiries" /></div>
              <div className="field"><label>When the message contains any of</label>
                <div className="kwbox">{draft.keywords.map((k) => <span key={k} className="tag">{k} <span className="x" role="button" aria-label={`Remove ${k}`} onClick={() => setDraft({ ...draft, keywords: draft.keywords.filter((x) => x !== k) })}>✕</span></span>)}
                  <input value={kwInput} onChange={(e) => setKwInput(e.target.value)} placeholder="Type a keyword, press Enter" aria-label="Add keyword"
                    onKeyDown={(e) => { if ((e.key === "Enter" || e.key === ",") && kwInput.trim()) { e.preventDefault(); if (!draft.keywords.includes(kwInput.trim().toLowerCase())) setDraft({ ...draft, keywords: [...draft.keywords, kwInput.trim().toLowerCase()] }); setKwInput(""); } }} /></div>
                <span className="hint">Not case-sensitive. Tip: add Hinglish spellings your customers use (e.g. “kitna”).</span></div>
              <div className="field"><label htmlFor="rule-reply">Reply with</label><textarea id="rule-reply" className="textarea" rows={4} value={draft.reply} onChange={(e) => setDraft({ ...draft, reply: e.target.value.slice(0, 1024) })} placeholder="Our packages start at ₹9,999 — want me to walk you through the options?" /><span className="hint" style={{ display: "flex", justifyContent: "space-between" }}><span>Sent only while the 24-hour reply window is open</span><span>{draft.reply.length} / 1024</span></span></div>
              <div className="field"><label>Run on</label>
                <div className="col gap-6">
                  <div className="hrow"><span className="icon-tile sm green"><Icon name="whatsapp-logo" /></span><span className="grow">WhatsApp messages</span><button className={`tog${draft.onWhatsapp ? " on" : ""}`} role="switch" aria-checked={draft.onWhatsapp} aria-label="WhatsApp messages" onClick={() => setDraft({ ...draft, onWhatsapp: !draft.onWhatsapp })} data-testid="ch-wa" /></div>
                  <div className="hrow"><span className="icon-tile sm pink"><Icon name="instagram-logo" /></span><span className="grow">Instagram DMs</span><button className={`tog${draft.onInstagramDm ? " on" : ""}`} role="switch" aria-checked={draft.onInstagramDm} aria-label="Instagram DMs" onClick={() => setDraft({ ...draft, onInstagramDm: !draft.onInstagramDm })} data-testid="ch-ig-dm" /></div>
                  <div className="hrow"><span className="icon-tile sm pink"><Icon name="chat-text" /></span><span className="grow">Instagram comments<small>Replies privately by DM to the person who commented</small></span><button className={`tog${draft.onInstagramComment ? " on" : ""}`} role="switch" aria-checked={draft.onInstagramComment} aria-label="Instagram comments" onClick={() => setDraft({ ...draft, onInstagramComment: !draft.onInstagramComment })} data-testid="ch-ig-comment" /></div>
                </div></div>
              {draft.onInstagramComment && (
                <div className="field"><label htmlFor="rule-public">Public reply under the comment <span className="opt">optional</span></label>
                  <input id="rule-public" className="input" value={draft.commentPublicReply} onChange={(e) => setDraft({ ...draft, commentPublicReply: e.target.value.slice(0, 300) })} placeholder="Sent you a DM with the details 💬" data-testid="rule-public-reply" />
                  <span className="hint">Everyone can see this. Keep it short — the details go in the DM.</span></div>
              )}
              <div className="hrow"><span className="grow">Send at most once per conversation<small>Avoids repeating the same answer</small></span><button className={`tog${draft.sendOnce ? " on" : ""}`} role="switch" aria-checked={draft.sendOnce} aria-label="Send once per conversation" onClick={() => setDraft({ ...draft, sendOnce: !draft.sendOnce })} /></div>
              {draft.id && <div className="note"><Icon name="chart-bar" /><span>Fired <b>{(rules ?? []).find((r) => r.id === draft.id)?.fired_count ?? 0} times</b>{(rules ?? []).find((r) => r.id === draft.id)?.last_fired_at ? ` · last ${new Date((rules ?? []).find((r) => r.id === draft.id)!.last_fired_at!).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}.</span></div>}
            </div>
            <div className="card-f">{draft.id && <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => void deleteRule()}><Icon name="trash" />Delete</button>}<span className="sp" /><button className="btn btn-soft" onClick={() => setDraft(null)}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={() => void saveRule()} data-testid="rule-save">Save reply</button></div>
          </>
        )}
      </aside>
      {note && <div role="status" style={{ position: "fixed", bottom: 90, left: "50%", transform: "translateX(-50%)", background: "var(--surface)", border: `1px solid ${note.kind === "ok" ? "var(--chat-line)" : "var(--danger-line)"}`, color: note.kind === "ok" ? "var(--chat-deep)" : "var(--danger-deep)", boxShadow: "var(--shadow-2)", borderRadius: 999, padding: "9px 16px", fontSize: 12, fontWeight: 700, zIndex: 95 }}>{note.text}</div>}
    </div>
  );
}
