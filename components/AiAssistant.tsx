"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Icon } from "./Icon";
import { Resizer, useStoredWidth } from "./Resizer";
import { aiStatus, applyAiAction, getAiContext, hasAiHandler, onAiContext, type AiAction, type AiContext } from "@/lib/ai-bridge";

/**
 * NextBiz AI — the assistant drawer (top bar ✨ or ⌘/Ctrl+J). It reads the workspace's data to answer,
 * and every change it suggests arrives as a card the person approves. Approving fills a form or a reply box,
 * or creates a rule switched OFF / a template as a draft — sending, publishing and switching on stay human.
 */
type Turn = { role: "user" | "assistant"; content: string; actions?: AiAction[]; tools?: string[]; error?: boolean };
type ActState = Record<string, "applied" | "done" | "dismissed" | "busy" | string>;

const PAGE_PROMPTS: Record<string, string[]> = {
  inbox: ["Summarise this chat", "Draft a reply to this customer", "Which chats need a reply first?"],
  campaign: ["Help me create a campaign step by step", "Fill the form: ₹500/day, Kolkata +25 km, WhatsApp chats", "Write 3 headline ideas"],
  comments: ["Draft replies for comments waiting", "What are people asking about most?"],
  automation: ["Suggest keyword rules from my recent chats", "Write a friendly welcome message"],
  templates: ["Write a festive offer template", "Why might a template get rejected?"],
  default: ["What needs my attention today?", "How are my ads doing this week?", "Help me create a campaign"],
};
const TOOL_LABEL: Record<string, string> = {
  get_overview: "overview", list_conversations: "chats", get_conversation: "a chat", search_contacts: "contacts", list_templates: "templates",
  list_keyword_rules: "rules", list_instagram_comments: "comments", list_ad_campaigns: "campaigns", search_ad_locations: "Meta locations", search_ad_interests: "Meta interests",
};
const FIELD_LABEL: Record<string, string> = { name: "Name", goal: "Goal", locations: "Locations", ageMin: "Age from", ageMax: "Age to", genders: "Gender", interests: "Interests",
  primaryText: "Text", headline: "Headline", description: "Description", websiteUrl: "Website", dailyBudget: "Budget / day" };

function fmtField(k: string, v: unknown): string {
  if (k === "locations" && Array.isArray(v)) return v.map((l: { name?: string; radiusKm?: number; type?: string }) => `${l.name}${l.type === "city" && l.radiusKm ? ` +${l.radiusKm}km` : ""}`).join(", ");
  if (k === "interests" && Array.isArray(v)) return v.map((i: { name?: string }) => i.name).join(", ");
  if (k === "dailyBudget") return `₹${Number(v).toLocaleString("en-IN")}`;
  if (k === "goal") return v === "whatsapp" ? "WhatsApp chats" : v === "instagram_dm" ? "Instagram DMs" : "Website visits";
  return String(v);
}
/** tiny, safe markdown: **bold**, bullet lines, line breaks */
function Md({ text }: { text: string }) {
  const lines = text.split(/\n/);
  const out: React.ReactNode[] = []; let list: React.ReactNode[] = [];
  const inline = (s: string, k: number) => s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => p.startsWith("**") && p.endsWith("**") ? <b key={`${k}-${i}`}>{p.slice(2, -2)}</b> : <span key={`${k}-${i}`}>{p}</span>);
  lines.forEach((l, i) => {
    const m = l.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (m) { list.push(<li key={i}>{inline(m[1], i)}</li>); return; }
    if (list.length) { out.push(<ul key={`u${i}`}>{list}</ul>); list = []; }
    if (l.trim()) out.push(<p key={i}>{inline(l, i)}</p>);
  });
  if (list.length) out.push(<ul key="ul-end">{list}</ul>);
  return <>{out}</>;
}

export function AiAssistant({ open, onClose, ask }: { open: boolean; onClose: () => void; ask?: { text: string; n: number } | null }) {
  const router = useRouter();
  const path = usePathname();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [acts, setActs] = useState<ActState>({});
  const [ctx, setCtx] = useState<AiContext | null>(null);
  const [usage, setUsage] = useState<{ usedToday: number; limit: number } | null>(null);
  const [w, setW] = useStoredWidth("nbo.ai.width");
  const panel = useRef<HTMLElement>(null), stream = useRef<HTMLDivElement>(null), ta = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { try { const s = sessionStorage.getItem("nbo.ai.turns"); if (s) setTurns(JSON.parse(s)); } catch { /* storage blocked */ } }, []);
  useEffect(() => { try { sessionStorage.setItem("nbo.ai.turns", JSON.stringify(turns.slice(-40))); } catch { /* storage blocked */ } }, [turns]);
  useEffect(() => { setCtx(getAiContext()); return onAiContext(() => setCtx(getAiContext())); }, []);
  useEffect(() => { if (open) { void aiStatus().then((s) => setUsage(s)); requestAnimationFrame(() => ta.current?.focus()); } }, [open]);
  useEffect(() => { const s = stream.current; if (s) s.scrollTop = s.scrollHeight; }, [turns, busy]);

  const asked = useRef(0);
  const pageKey = ctx?.page ?? (path.startsWith("/ads") ? "campaign" : path.startsWith("/inbox") || path.startsWith("/social/dms") ? "inbox" : path.startsWith("/social/comments") ? "comments" : path.includes("automation") ? "automation" : path.startsWith("/templates") ? "templates" : "default");

  const send = useCallback(async (text: string) => {
    const q = text.trim(); if (!q || busy) return;
    const next = [...turns, { role: "user" as const, content: q }];
    setTurns(next); setInput(""); setBusy(true);
    // history for the model: text only, with proposals summarised so it remembers what it suggested
    const history = next.slice(-20).map((t) => ({ role: t.role, content: t.role === "assistant" && t.actions?.length ? `${t.content}\n[I proposed: ${t.actions.map((a) => `${a.summary} — ${acts[a.id] === "applied" || acts[a.id] === "done" ? "user approved" : acts[a.id] === "dismissed" ? "user dismissed" : "not yet approved"}`).join("; ")}]` : t.content }))
      .filter((t) => t.content);
    const c = getAiContext();
    const d = await fetch("/api/ai/chat", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: history, context: { path, page: c?.page ?? pageKey, title: c?.title, entity: c?.entity } }) }).then((r) => r.json()).catch(() => null);
    setBusy(false);
    setTurns((ts) => [...ts, d?.ok ? { role: "assistant", content: d.reply, actions: d.actions, tools: d.tools } : { role: "assistant", content: d?.error ?? "I couldn't reach the AI — try again.", error: true }]);
    void aiStatus().then(() => setUsage((u) => u ? { ...u, usedToday: u.usedToday + 1 } : u));
  }, [turns, busy, path, pageKey, acts]);

  // a question handed over from the page (e.g. the dashboard's "Ask AI" button)
  useEffect(() => { if (open && ask && ask.n !== asked.current && !busy) { asked.current = ask.n; void send(ask.text); } }, [open, ask, busy, send]);

  async function approve(a: AiAction) {
    if (a.type === "campaign_form" || a.type === "reply") {
      const r = applyAiAction(a, router);
      setActs((s) => ({ ...s, [a.id]: "applied" }));
      if (r === "navigating") setTurns((ts) => [...ts, { role: "assistant", content: a.type === "campaign_form" ? "Opening the campaign builder with these values — review them, then publish when you're happy." : "Opening the chat with this reply in the box — edit it if you like, then press Send." }]);
      return;
    }
    setActs((s) => ({ ...s, [a.id]: "busy" }));
    const p = a.payload;
    const res = a.type === "keyword_rule"
      ? await fetch("/api/automation/rules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: p.name, keywords: p.keywords, reply: p.reply, enabled: false,
          onWhatsapp: p.onWhatsapp ?? true, onInstagramDm: !!p.onInstagramDm, onInstagramComment: !!p.onInstagramComment, commentPublicReply: p.commentPublicReply ?? null }) })
      : await fetch("/api/templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: p.name, category: p.category, language: p.language, body: p.body, submit: false }) });
    const d = await res.json().catch(() => null);
    setActs((s) => ({ ...s, [a.id]: res.ok && d?.ok !== false ? "done" : `error:${d?.error ?? "Couldn't save"}` }));
  }

  function Card({ a }: { a: AiAction }) {
    const st = acts[a.id];
    const p = a.payload;
    const here = hasAiHandler(a.type);
    return (
      <div className={`ai-card t-${a.type}${st === "dismissed" ? " gone" : ""}`} data-testid="ai-card">
        <div className="ai-card-h"><Icon name={a.type === "campaign_form" ? "megaphone" : a.type === "reply" ? "chat-text" : a.type === "keyword_rule" ? "lightning" : "notebook"} size="sm" /><b>{a.summary}</b></div>
        {a.type === "campaign_form" && <dl className="ai-kv">{Object.entries(p).filter(([k, v]) => FIELD_LABEL[k] && v !== null && v !== "" && !(Array.isArray(v) && !v.length)).map(([k, v]) => <div key={k}><dt>{FIELD_LABEL[k]}</dt><dd>{fmtField(k, v)}</dd></div>)}</dl>}
        {a.type === "reply" && <p className="ai-quote">{String(p.text ?? "")}</p>}
        {a.type === "keyword_rule" && <dl className="ai-kv"><div><dt>When</dt><dd>{(p.keywords as string[] | undefined)?.join(", ")}</dd></div><div><dt>Reply</dt><dd>{String(p.reply ?? "")}</dd></div>
          <div><dt>Runs on</dt><dd>{[p.onWhatsapp !== false && "WhatsApp", p.onInstagramDm && "Instagram DMs", p.onInstagramComment && "Instagram comments"].filter(Boolean).join(", ")}</dd></div></dl>}
        {a.type === "template" && <dl className="ai-kv"><div><dt>Name</dt><dd className="mono">{String(p.name)}</dd></div><div><dt>Type</dt><dd>{String(p.category).toLowerCase()} · {String(p.language)}</dd></div><div><dt>Text</dt><dd>{String(p.body)}</dd></div></dl>}
        <div className="ai-card-f">
          {st === "applied" ? <span className="ok"><Icon name="check" size="xs" />{a.type === "reply" ? "In the reply box — you send it" : "Filled in — review and publish yourself"}</span>
            : st === "done" ? <span className="ok"><Icon name="check" size="xs" />{a.type === "keyword_rule" ? "Rule created, switched OFF — turn it on in Auto-replies" : "Saved as a draft — submit it from Templates"}</span>
            : st?.startsWith("error:") ? <span className="bad">{st.slice(6)}</span>
            : st === "dismissed" ? <span className="faint">Dismissed</span>
            : <>
                <button className="btn btn-primary btn-sm" disabled={st === "busy"} onClick={() => void approve(a)} data-testid="ai-approve">
                  <Icon name="check" />{a.type === "campaign_form" ? (here ? "Apply to form" : "Open builder & fill") : a.type === "reply" ? (here ? "Insert reply" : "Open chat & insert") : a.type === "keyword_rule" ? "Create (off)" : "Save as draft"}</button>
                {a.type === "reply" && <button className="btn btn-ghost btn-sm" onClick={() => { void navigator.clipboard?.writeText(String(p.text ?? "")).catch(() => {}); }}>Copy</button>}
                <span className="sp" /><button className="btn btn-ghost btn-sm" onClick={() => setActs((s) => ({ ...s, [a.id]: "dismissed" }))}>Dismiss</button>
              </>}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={`ai-scrim${open ? " open" : ""}`} onClick={onClose} />
      <aside ref={panel} className={`ai-panel${open ? " open" : ""}`} aria-label="NextBiz AI" aria-hidden={!open} style={w ? { width: `min(${w}px, calc(100vw - 24px))` } : undefined} data-testid="ai-panel">
        {open && <Resizer edge="left" label="AI panel width" className="rz-ai" width={() => panel.current?.offsetWidth ?? 420} min={340} max={() => Math.min(760, window.innerWidth - 80)} onResize={setW} onReset={() => setW(null)} />}
        <header className="ai-h">
          <span className="ai-logo"><Icon name="sparkle" /></span>
          <span className="grow"><b>NextBiz AI</b><small>{ctx?.title ? `Looking at: ${ctx.title}` : "Ask about your chats, contacts, ads…"}</small></span>
          {usage && usage.limit > 0 && <span className="ai-use" title="AI requests used today">{usage.usedToday}/{usage.limit}</span>}
          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => { setTurns([]); setActs({}); }} title="New conversation" aria-label="New conversation"><Icon name="note-pencil" /></button>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Close AI"><Icon name="x" /></button>
        </header>
        <div className="ai-stream" ref={stream}>
          {turns.length === 0 && (
            <div className="ai-hello">
              <span className="ai-orb"><Icon name="sparkle" /></span>
              <b>Hi! I can read your workspace and help you work faster.</b>
              <p>I&apos;ll suggest — you approve. I never send messages, publish ads or switch anything on by myself.</p>
              <div className="ai-prompts">{(PAGE_PROMPTS[pageKey] ?? PAGE_PROMPTS.default).map((p) => <button key={p} onClick={() => void send(p)} data-testid="ai-prompt">{p}</button>)}</div>
            </div>
          )}
          {turns.map((t, i) => (
            <div key={i} className={`ai-msg ${t.role}${t.error ? " err" : ""}`}>
              {t.role === "assistant" && t.tools && t.tools.length > 0 && <span className="ai-tools"><Icon name="magnifying-glass" size="xs" />Looked at {[...new Set(t.tools.filter((x) => !x.startsWith("propose_")).map((x) => TOOL_LABEL[x] ?? x))].join(", ") || "your request"}</span>}
              <div className="ai-bub">{t.role === "assistant" ? <Md text={t.content} /> : t.content}</div>
              {t.actions?.map((a) => <Card key={a.id} a={a} />)}
            </div>
          ))}
          {busy && <div className="ai-msg assistant"><div className="ai-bub typing"><span /><span /><span /></div></div>}
        </div>
        <form className="ai-in" onSubmit={(e) => { e.preventDefault(); void send(input); }}>
          <textarea ref={ta} rows={1} value={input} placeholder="Ask anything, or say “fill the campaign for me”…" onChange={(e) => { setInput(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(140, e.target.scrollHeight) + "px"; }}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(input); } if (e.key === "Escape") onClose(); }} aria-label="Message NextBiz AI" data-testid="ai-input" />
          <button className="btn btn-primary btn-icon" disabled={busy || !input.trim()} aria-label="Send" data-testid="ai-send"><Icon name="paper-plane-right" /></button>
        </form>
      </aside>
    </>
  );
}
