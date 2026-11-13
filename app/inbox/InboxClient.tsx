"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { avatarClass, fmtPhone, initials } from "@/lib/ui";

/**
 * Inbox — design v2 (nextbiz-one-v2/inbox). Layout follows the content width (container queries):
 * ≥1040 list | thread | details · 700–1039 list | thread (+details drawer) · <700 list → thread.
 * The 24h reply window drives three composer states: open · closing soon (<3h) · closed (templates only).
 */
type Conv = {
  id: string; wa_id: string; name: string | null; opt_in: boolean; tags: string[] | null;
  preview: string | null; last_direction: "in" | "out" | null; last_status: string | null; last_at: string | null;
  unread: number; last_inbound_at: string | null;
};
type Msg = { id: string; direction: "in" | "out"; body: string | null; status: string; type?: string; created_at: string };
type Thread = {
  conversation: {
    id: string; contactId: string; waId: string; name: string | null; optIn: boolean; lastInboundAt: string | null; windowOpen: boolean;
    tags: string[]; company: string | null; location: string | null; interestedIn: string | null; budget: string | null;
    automationPaused: boolean; automationPausedAt: string | null; welcomeSentAt: string | null; contactCreatedAt: string | null;
  };
  messages: Msg[];
};
type Tpl = { id: string; name: string; category: string; status: string };

const WINDOW_MS = 24 * 3600 * 1000;
const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
function listTime(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso), now = new Date();
  if (d.toDateString() === now.toDateString()) return clock(iso);
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  if (now.getTime() - d.getTime() < 6 * 86400000) return d.toLocaleDateString("en-GB", { weekday: "short" });
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
function daysAgo(iso: string) {
  const d = new Date(iso); d.setHours(0, 0, 0, 0);
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.round((t.getTime() - d.getTime()) / 86400000);
}
function dayGroup(iso: string | null) {
  if (!iso) return "Earlier";
  const n = daysAgo(iso);
  return n <= 0 ? "Today" : n === 1 ? "Yesterday" : n < 7 ? "This week" : "Earlier";
}
function dayLabel(iso: string) {
  const n = daysAgo(iso);
  return n <= 0 ? "Today" : n === 1 ? "Yesterday" : new Date(iso).toLocaleDateString("en-GB", { weekday: n < 7 ? "long" : undefined, day: "numeric", month: "short" });
}
function windowInfo(lastInboundAt: string | null) {
  if (!lastInboundAt) return { state: "closed" as const, left: 0, pct: 0 };
  const left = WINDOW_MS - (Date.now() - new Date(lastInboundAt).getTime());
  if (left <= 0) return { state: "closed" as const, left: 0, pct: 0 };
  return { state: left < 3 * 3600 * 1000 ? ("soon" as const) : ("open" as const), left, pct: Math.round((left / WINDOW_MS) * 100) };
}
const dur = (ms: number) => { const m = Math.max(0, Math.floor(ms / 60000)); const h = Math.floor(m / 60); if (h >= 48) return `${Math.floor(h / 24)} days`; return h ? `${h}h ${m % 60}m` : `${m}m`; };
const ago = (iso: string) => dur(Date.now() - new Date(iso).getTime());
const MEDIA: Record<string, [string, string]> = { image: ["image", "Photo"], video: ["play", "Video"], audio: ["microphone", "Voice message"], document: ["file-pdf", "Document"], sticker: ["smiley", "Sticker"], location: ["map-pin", "Location"] };

export function InboxClient() {
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [q, setQ] = useState("");
  const [convs, setConvs] = useState<Conv[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [thread, setThread] = useState<Thread | null>(null);
  const [viewThread, setViewThread] = useState(false);
  const [details, setDetails] = useState<"auto" | "hidden" | "open">("auto");
  const [draft, setDraft] = useState("");
  const [sendErr, setSendErr] = useState("");
  const [sending, setSending] = useState(false);
  const [tpls, setTpls] = useState<Tpl[] | null>(null);
  const [copied, setCopied] = useState(false);
  const [, tick] = useState(0);
  const streamRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const loadList = useCallback(async () => {
    const res = await fetch(`/api/conversations?unread=${filter === "unread" ? 1 : 0}`, { cache: "no-store" });
    const data = (await res.json().catch(() => null)) as { conversations?: Conv[] } | null;
    setConvs(data?.conversations ?? []);
  }, [filter]);

  const open = useCallback(async (id: string, focusThread = true) => {
    setSelected(id);
    if (focusThread) setViewThread(true);
    setSendErr("");
    const res = await fetch(`/api/conversations/${id}`, { cache: "no-store" });
    const data = (await res.json().catch(() => null)) as Thread | null;
    if (data?.conversation) {
      setThread(data);
      await fetch(`/api/conversations/${id}/read`, { method: "POST" }).catch(() => {});
      void loadList();
    }
  }, [loadList]);

  useEffect(() => { void loadList(); }, [loadList]);
  // desktop: open the newest conversation so the thread is never an empty pane
  useEffect(() => {
    if (!selected && convs && convs.length > 0 && window.matchMedia("(min-width: 768px)").matches) void open(convs[0].id, false);
  }, [convs, selected, open]);
  // keep list fresh + window countdown ticking
  useEffect(() => {
    const t = setInterval(() => { void loadList(); tick((n) => n + 1); }, 30000);
    return () => clearInterval(t);
  }, [loadList]);
  useEffect(() => { const s = streamRef.current; if (s) requestAnimationFrame(() => { s.scrollTop = s.scrollHeight; }); }, [thread?.messages.length, thread?.conversation.id, tpls]);

  const sel = thread?.conversation;
  const win = windowInfo(sel?.lastInboundAt ?? null);
  useEffect(() => {
    if (sel && win.state === "closed" && tpls === null) {
      fetch("/api/templates", { cache: "no-store" }).then((r) => r.json()).then((d) => setTpls((d?.templates ?? []).filter((t: Tpl) => /approved/i.test(t.status)))).catch(() => setTpls([]));
    }
  }, [sel, win.state, tpls]);

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (convs ?? []).filter((c) => !n || (c.name ?? "").toLowerCase().includes(n) || c.wa_id.includes(n.replace(/\D/g, "") || "\u0000") || (c.preview ?? "").toLowerCase().includes(n));
  }, [convs, q]);
  const unreadTotal = (convs ?? []).filter((c) => c.unread > 0).length;

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    if (!selected || !draft.trim() || sending) return;
    setSending(true); setSendErr("");
    try {
      const res = await fetch(`/api/conversations/${selected}/messages`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: draft }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !data?.ok) setSendErr(data?.error ?? "Couldn't send — try again.");
      else { setDraft(""); await open(selected, false); }
    } finally { setSending(false); }
  }

  const toggleDetails = () => {
    const wide = (document.querySelector("main.content")?.clientWidth ?? 0) >= 1040;
    setDetails((d) => (wide ? (d === "hidden" ? "auto" : "hidden") : d === "open" ? "auto" : "open"));
  };
  const copyNumber = async () => {
    if (!sel) return;
    try { await navigator.clipboard.writeText(`+${sel.waId}`); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
  };

  // group consecutive messages; insert day dividers
  const stream: React.ReactNode[] = [];
  let lastDay = "", lastDir = "";
  for (const m of thread?.messages ?? []) {
    const d = dayLabel(m.created_at);
    if (d !== lastDay) { stream.push(<span key={`d-${m.id}`} className="day">{d}</span>); lastDay = d; lastDir = ""; }
    const first = m.direction !== lastDir; lastDir = m.direction;
    const media = m.type && m.type !== "text" ? MEDIA[m.type] ?? ["paperclip", m.type] : null;
    stream.push(
      <div key={m.id} className={`msg ${m.direction}${first ? " first" : ""}`}>
        <div className="bub">
          {media && <span className="row gap-6" style={{ fontWeight: 700, color: "var(--ink-2)" }}><Icon name={media[0]} size="sm" />{media[1]}</span>}
          {m.body}
          <span className="meta">{clock(m.created_at)}
            {m.direction === "out" && (m.status === "failed"
              ? <Icon name="warning-circle" style={{ color: "var(--danger-deep)" }} title="Not delivered" />
              : <Icon name={m.status === "sent" ? "check" : "checks"} className={m.status === "read" ? "read" : ""} title={m.status} />)}
          </span>
        </div>
      </div>,
    );
  }

  const groups: { label: string; items: Conv[] }[] = [];
  for (const c of shown) {
    const g = dayGroup(c.last_at ?? c.last_inbound_at);
    if (!groups.length || groups[groups.length - 1].label !== g) groups.push({ label: g, items: [] });
    groups[groups.length - 1].items.push(c);
  }
  const empty = convs !== null && convs.length === 0 && filter === "all";

  return (
    <div className="pg-inbox" style={{ height: "100%" }}>
      <div className={`ib${viewThread ? " view-thread" : ""}${details === "hidden" ? " details-hidden" : ""}${details === "open" ? " details-open" : ""}`}
        data-win={win.state} data-data={empty ? "empty" : convs === null ? "loading" : "full"} data-testid="inbox">

        <section className="card lcard" aria-label="Conversations">
          <div className="lhead">
            <div className="chips">
              <button className={`chip${filter === "all" ? " on" : ""}`} onClick={() => setFilter("all")}>All {filter === "all" && convs && <span className="n">{convs.length}</span>}</button>
              <button className={`chip${filter === "unread" ? " on" : ""}`} onClick={() => setFilter("unread")}>Unread {filter === "all" && unreadTotal > 0 && <span className="n">{unreadTotal}</span>}</button>
            </div>
            <label className="search"><Icon name="magnifying-glass" size="sm" /><input data-testid="inbox-search" placeholder="Search name, number or message" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search conversations" /></label>
          </div>
          <div className="clist real" data-testid="thread-list">
            {shown.length === 0 && convs !== null && (
              <div className="empty"><div className="art"><Icon name="tray" /></div><h3>Nothing here</h3><p>{q ? "No conversations match your search." : "No unread conversations — you're all caught up."}</p></div>
            )}
            {groups.map((g) => (
              <div key={g.label}>
                <div className="cgrp eyebrow">{g.label}</div>
                {g.items.map((c) => {
                  const w = windowInfo(c.last_inbound_at);
                  return (
                    <div key={c.id} className={`cv${c.unread > 0 ? " unread" : ""}${selected === c.id ? " on" : ""}`} data-testid="crow" tabIndex={0}
                      onClick={() => void open(c.id)} onKeyDown={(e) => e.key === "Enter" && void open(c.id)}>
                      <span className={`av ${avatarClass(c.wa_id)}`}>{initials(c.name, c.wa_id)}<span className="src wa"><Icon name="whatsapp-logo" /></span></span>
                      <div className="body">
                        <div className="l1"><span className="nm">{c.name ?? fmtPhone(c.wa_id)}</span><span className="tm">{listTime(c.last_at ?? c.last_inbound_at)}</span></div>
                        <div className="l2">
                          <span className="pv">{c.last_direction === "out" && <span className="you"><Icon name={c.last_status === "sent" ? "check" : "checks"} className={c.last_status === "read" ? "read" : ""} />You: </span>}{c.preview ?? "—"}</span>
                          {c.unread > 0 && <span className="badge">{c.unread}</span>}
                        </div>
                        {(w.state !== "open" || (c.tags?.length ?? 0) > 0) && (
                          <div className="l3">
                            {w.state === "soon" && <span className="wtag soon"><Icon name="hourglass" />{dur(w.left)} left</span>}
                            {w.state === "closed" && <span className="wtag closed"><Icon name="lock" />Window closed</span>}
                            {(c.tags ?? []).slice(0, 2).map((t) => <span key={t} className="tag green">{t}</span>)}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="clist loading" style={{ flexDirection: "column" }}>
            {[55, 40, 62, 48].map((w) => <div key={w} className="skrow"><span className="sk av" /><span className="grow col gap-6"><span className="sk" style={{ height: 12, width: `${w}%` }} /><span className="sk" style={{ height: 10, width: "80%" }} /></span></div>)}
          </div>
        </section>

        <section className="card tcard" aria-label="Conversation">
          {!sel ? (
            <div className="empty" style={{ flex: 1 }}><div className="art"><Icon name="chat-circle-dots" /></div><h3>Pick a conversation</h3><p>Choose a chat on the left to read and reply.</p></div>
          ) : (
            <>
              <header className="thead">
                <button className="btn btn-ghost btn-icon back" onClick={() => setViewThread(false)} aria-label="Back to conversations" data-testid="thread-back"><Icon name="arrow-left" /></button>
                <span className={`av ${avatarClass(sel.waId)}`}>{initials(sel.name, sel.waId)}<span className="src wa"><Icon name="whatsapp-logo" /></span></span>
                <div className="who">
                  <b><span className="trunc">{sel.name ?? fmtPhone(sel.waId)}</span></b>
                  <small><span className="num">{fmtPhone(sel.waId)}</span>{sel.tags[0] && <><span className="hide-s">·</span><span className="tag green hide-s">{sel.tags[0]}</span></>}</small>
                </div>
                <span className="winchip" title="WhatsApp allows free-form replies for 24 hours after the customer's last message" style={{ ["--p" as string]: `${win.pct}%` }}>
                  <span className="ring" /><Icon name="lock" size="xs" className="lock" />
                  <span>{win.state === "closed" ? "Window closed" : `${dur(win.left)} left`}</span>{win.state !== "closed" && <span className="txt-l" style={{ fontWeight: 600, opacity: .8 }}>to reply</span>}
                </span>
                <button className="btn btn-ghost btn-icon" onClick={toggleDetails} aria-label="Contact details" title="Contact details" data-testid="panel-toggle"><Icon name="sidebar-simple" /></button>
              </header>

              <div className="stream" ref={streamRef} data-testid="stream">
                {sel.contactCreatedAt && thread.messages.length > 0 && new Date(sel.contactCreatedAt) <= new Date(thread.messages[0].created_at) && (
                  <div className="sys"><Icon name="user-plus" />New contact · added automatically from their first message</div>
                )}
                {stream}
                {sel.automationPaused && <div className="sys pause"><Icon name="hand" />Automation is paused for this chat because you replied</div>}
              </div>

              <footer className="composer">
                {win.state === "soon" && <div className="cbanner"><Icon name="hourglass" /><span>Reply window closes in <b>{dur(win.left)}</b>. After that you can only send approved templates.</span></div>}
                {win.state !== "closed" ? (
                  <form className="cbox" onSubmit={send}>
                    <textarea ref={taRef} id="composer-input" data-testid="composer-input" rows={1} placeholder="Write a reply…" value={draft}
                      onChange={(e) => { setDraft(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(160, e.target.scrollHeight) + "px"; }}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} aria-label="Message" />
                    <div className="ctools">
                      <a className="btn btn-ghost btn-sm" href="/templates" title="Templates"><Icon name="notebook" />Templates</a>
                      <span className="hint faint">Enter to send · Shift + Enter for new line</span>
                      <button type="submit" className="btn btn-primary send" style={{ marginLeft: "auto" }} disabled={sending || !draft.trim()} data-testid="send-btn"><Icon name="paper-plane-right" />{sending ? "Sending…" : "Send"}</button>
                    </div>
                  </form>
                ) : (
                  <div className="closed-box blocked" data-testid="window-closed">
                    <div className="top"><span className="icon-tile sm neutral"><Icon name="lock" /></span>
                      <span className="grow"><b>The 24-hour reply window is closed{sel.lastInboundAt ? ` (${ago(new Date(new Date(sel.lastInboundAt).getTime() + WINDOW_MS).toISOString())} ago)` : ""}</b>
                        <p>WhatsApp only allows approved templates until {sel.name?.split(" ")[0] ?? "they"} reply again. Send one to this contact from Broadcasts to restart the conversation.</p></span></div>
                    <div className="tplpick">
                      {(tpls ?? []).slice(0, 3).map((t) => <span key={t.id} className="tag" style={{ height: 28, fontSize: "var(--fs-xs)" }}>{t.name}<small style={{ marginLeft: 4, color: "var(--ink-3)" }}>{t.category.toLowerCase()}</small></span>)}
                      {tpls !== null && tpls.length === 0 && <span className="xs faint" style={{ fontWeight: 600 }}>No approved templates yet.</span>}
                      <span className="sp" />
                      <a className="btn btn-soft btn-sm" href="/templates">Templates</a>
                      <a className="btn btn-primary btn-sm" href={`/broadcasts?to=${encodeURIComponent(sel.contactId)}`}><Icon name="megaphone" />Send a template</a>
                    </div>
                  </div>
                )}
                {sendErr && <div className="note bad" style={{ fontSize: "var(--fs-xs)" }}><Icon name="warning-circle" size="sm" /><span>{sendErr}</span></div>}
              </footer>
            </>
          )}
        </section>

        <aside className="card dpanel" aria-label="Contact details">
          <div className="tabs" style={{ paddingRight: 8 }}>
            <span className="tab on">Contact</span><span className="sp" />
            <button className="btn btn-ghost btn-icon btn-sm dclose" onClick={() => setDetails("auto")} aria-label="Close details" style={{ alignSelf: "center" }}><Icon name="x" /></button>
          </div>
          <div className="dscroll">
            {sel ? (
              <>
                <div className="dsec ident">
                  <span className={`av xl ${avatarClass(sel.waId)}`}>{initials(sel.name, sel.waId)}</span>
                  <div><h3>{sel.name ?? "Unnamed contact"}</h3><div className="ph">{fmtPhone(sel.waId)}</div></div>
                  <div className="qa">
                    <button onClick={copyNumber}><Icon name={copied ? "check" : "copy"} />{copied ? "Copied" : "Copy number"}</button>
                    <a href={`/contacts?id=${encodeURIComponent(sel.contactId)}`} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, height: 54, borderRadius: 11, background: "var(--bg)", border: "1px solid var(--line)", fontSize: 10, fontWeight: 700, color: "var(--ink-2)" }}><Icon name="identification-card" />Profile</a>
                    <a href={`/broadcasts?to=${encodeURIComponent(sel.contactId)}`} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, height: 54, borderRadius: 11, background: "var(--bg)", border: "1px solid var(--line)", fontSize: 10, fontWeight: 700, color: "var(--ink-2)" }}><Icon name="megaphone" />Template</a>
                  </div>
                </div>
                <div className="dsec">
                  <div className="wincard">
                    <div className="t"><Icon name="clock-countdown" size="sm" /><span style={{ margin: 0 }}>{win.state === "closed" ? "Reply window closed" : win.state === "soon" ? "Window closing soon" : "Reply window open"}</span><span>{win.state === "closed" ? "—" : dur(win.left)}</span></div>
                    <div className="meter"><span style={{ width: `${win.pct}%` }} /></div>
                    <p>{win.state === "closed" ? "Send an approved template to restart. The window reopens when they reply." : "Free-form replies are allowed until the window closes. After that, only approved templates."}</p>
                  </div>
                  <div className="setrow"><span className="icon-tile sm grape"><Icon name="lightning" /></span>
                    <span className="grow">Automation<small>{sel.automationPaused ? `Paused — you replied${sel.automationPausedAt ? ` ${ago(sel.automationPausedAt)} ago` : ""}` : "Active for this chat"}</small></span>
                    <span className={`pill sm ${sel.automationPaused ? "warn" : "ok"}`}>{sel.automationPaused ? "Paused" : "On"}</span></div>
                </div>
                {sel.tags.length > 0 && (
                  <div className="dsec"><div className="sh"><span className="eyebrow">Tags</span></div>
                    <div className="row wrap gap-6">{sel.tags.map((t) => <span key={t} className="tag green">{t}</span>)}</div></div>
                )}
                <div className="dsec">
                  <div className="sh"><span className="eyebrow">Details</span><a className="btn-link" href={`/contacts?id=${encodeURIComponent(sel.contactId)}`}>Edit</a></div>
                  <dl className="kv">
                    <dt>Company</dt><dd className={sel.company ? "" : "faint"}>{sel.company ?? "—"}</dd>
                    <dt>Location</dt><dd className={sel.location ? "" : "faint"}>{sel.location ?? "—"}</dd>
                    <dt>Interested in</dt><dd className={sel.interestedIn ? "" : "faint"}>{sel.interestedIn ?? "—"}</dd>
                    <dt>Budget</dt><dd className={sel.budget ? "" : "faint"}>{sel.budget ?? "—"}</dd>
                    <dt>Marketing opt-in</dt><dd>{sel.optIn ? <span className="pill ok sm">Opted in</span> : <span className="pill neutral sm">Not opted in</span>}</dd>
                  </dl>
                  <div className={`note ${sel.optIn ? "ok" : ""}`} style={{ fontSize: "10.5px" }}><Icon name={sel.optIn ? "check-circle" : "info"} size="sm" />
                    <span>{sel.optIn ? "Can receive broadcasts." : "Won't receive broadcasts until they opt in (for example by replying START)."}</span></div>
                </div>
              </>
            ) : (
              <div className="empty"><p>Select a conversation to see contact details.</p></div>
            )}
          </div>
        </aside>

        <section className="zero" aria-label="No conversations yet">
          <div className="zero-in">
            <div>
              <span className="pill ok">WhatsApp connected</span>
              <h2 style={{ marginTop: 12 }}>Your inbox is ready.<br />Say hi to see it work.</h2>
              <p>Every WhatsApp message your customers send to your business number lands here — with their 24-hour reply window, tags and history.</p>
              <ol>
                <li><span>Send <b>“Hi”</b> from your personal phone to your business number.</span></li>
                <li><span>It appears here within a few seconds — reply right from this screen.</span></li>
                <li><span>Turn on a <b>welcome message</b> so new customers get an instant reply.</span></li>
              </ol>
              <div className="row" style={{ marginTop: 20, gap: 8, flexWrap: "wrap" }}>
                <a className="btn btn-primary" href="/onboarding"><Icon name="whatsapp-logo" />Run the live test</a>
                <a className="btn btn-soft" href="/automation"><Icon name="lightning" />Set up welcome message</a>
              </div>
            </div>
            <div className="phone"><div className="ph-top"><img src="/logo.png" alt="" />Your business</div>
              <div className="ph-body"><span>Hi 👋</span><span className="in">Hi! Thanks for reaching out — how can we help?</span></div></div>
          </div>
        </section>
      </div>
    </div>
  );
}
