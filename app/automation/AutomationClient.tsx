"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Automation — ported 1:1 from automation/wireframe.html: a-main (a-left ~60%
 * + inspector ~40%), welcome 3-band card, keyword dtable with tab/search/sort
 * chrome, bottom hours + FAQ row. Contains-match only, no regex/AI (v1 lock).
 */
type Rule = {
  id: string; name: string; keywords: string[]; reply: string;
  enabled: boolean; send_once: boolean; fired_count: number; last_fired_at: string | null;
};
type Settings = {
  welcome_enabled: boolean; welcome_text: string;
  away_enabled: boolean; away_text: string | null;
  business_hours: Record<string, [string, string]>;
} | null;
type Faq = { id: string; question: string; answer: string };
type LogRow = { type: string; detail: string | null; status: string; created_at: string; rule_id: string | null; first_name: string | null; wa_id: string | null };

const IC = "https://cdn.joyverse.fun/mira-assets/phosphor/bold/";
const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const dayShort = (d: string) => ({ mon: "Mo", tue: "Tu", wed: "We", thu: "Th", fri: "Fr", sat: "Sa", sun: "Su" } as Record<string, string>)[d] ?? d;

export function AutomationClient() {
  const [settings, setSettings] = useState<Settings>(null);
  const [rules, setRules] = useState<Rule[]>([]);
  const [faq, setFaq] = useState<Faq[]>([]);
  const [log, setLog] = useState<LogRow[]>([]);
  const [tab, setTab] = useState<"all" | "active" | "inactive">("all");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Rule | null>(null);
  const [testText, setTestText] = useState("");
  const [testRes, setTestRes] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    const d = await fetch("/api/automation").then((x) => x.json()).catch(() => null);
    if (d?.ok) {
      setSettings(d.settings); setRules(d.rules ?? []); setFaq(d.faq ?? []); setLog(d.log ?? []);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const shown = rules.filter((r) =>
    (tab === "all" || (tab === "active" ? r.enabled : !r.enabled)) &&
    (!q || r.name.toLowerCase().includes(q.toLowerCase()) || r.keywords.some((k) => k.toLowerCase().includes(q.toLowerCase()))));
  const selFresh = sel ? rules.find((r) => r.id === sel.id) ?? sel : null;

  async function saveRule(r: Partial<Rule> & { id?: string }) {
    const isNew = !r.id;
    const res = await fetch(isNew ? "/api/automation/rules" : `/api/automation/rules/${r.id}`, {
      method: isNew ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(isNew
        ? { name: r.name ?? "New rule", keywords: r.keywords ?? ["keyword"], reply: r.reply ?? "Reply text" }
        : r),
    });
    const d = await res.json().catch(() => null);
    setNote(d?.ok ? "Saved ✓" : (d?.error ?? "Save failed"));
    if (d?.ok) { await load(); if (isNew && d.rule) setSel(d.rule); }
  }

  async function testRule() {
    if (!testText.trim()) return;
    const d = await fetch("/api/automation/rules/test", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: testText }),
    }).then((x) => x.json()).catch(() => null);
    setTestRes(d?.matched ? `→ Matches "${d.keyword}" · rule "${d.rule}" would fire` : "→ No rule matches this text");
  }

  return (
    <div className="a-main" data-testid="automation">
      <div className="a-left">
        {/* WELCOME — 3-band card */}
        <section className="awelc">
          <div className="aw-head">
            <span className="dt-ic chat"><img src={`${IC}chat-circle-bold.svg`} alt="" /></span>
            <div className="t"><b>Welcome message</b><span>Sent automatically on a new contact's first message — once per conversation.</span></div>
            <span className="st-pill on">{settings?.welcome_enabled ? "Active" : "Off"}</span>
            <button className="btn btn-soft" style={{ minHeight: 24, padding: "0 8px", fontSize: 9.5 }}
                    onClick={() => void fetch("/api/automation/settings", { method: "PUT", headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ welcomeEnabled: !(settings?.welcome_enabled ?? true) }) }).then(() => load())}>
              {settings?.welcome_enabled ? "Turn off" : "Turn on"}</button>
          </div>
          <div className="aw-body">
            <div className="thread wchat">
              <div className="xbub in">Hi, I need a website for my bakery <small>10:24</small></div>
              <div className="xbub out">{settings?.welcome_text ?? "Hi! Thanks for reaching out — we usually reply within a day."}<small>10:24 ✓✓</small></div>
            </div>
          </div>
          <div className="aw-stats">
            <span className="aw-stat"><img src={`${IC}lightning-bold.svg`} alt="" />Trigger · first message</span>
            <span className="aw-stat"><img src={`${IC}chart-bar-bold.svg`} alt="" /><b>{log.filter((l) => l.type === "welcome").length}</b> total</span>
            <span className="aw-stat ok"><img src={`${IC}check-bold.svg`} alt="" /><b>{log.filter((l) => l.type === "welcome" && l.status === "sent").length}</b> sent</span>
            <span className="aw-edit" onClick={() => {
              const t = prompt("Welcome message (max 1024 chars):", settings?.welcome_text ?? "") ?? "";
              if (t) void fetch("/api/automation/settings", { method: "PUT", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ welcomeText: t.slice(0, 1024) }) }).then(() => load());
            }}>Edit message <img src={`${IC}arrow-right-bold.svg`} alt="" /></span>
          </div>
        </section>

        {/* KEYWORD RULES */}
        <section className="a-table">
          <div className="dt-tabs">
            <span className={`dt-tab${tab === "all" ? " on" : ""}`} onClick={() => setTab("all")}>All rules <span className="tn">{rules.length}</span></span>
            <span className={`dt-tab${tab === "active" ? " on" : ""}`} onClick={() => setTab("active")}>Active <span className="tn">{rules.filter((r) => r.enabled).length}</span></span>
            <span className={`dt-tab${tab === "inactive" ? " on" : ""}`} onClick={() => setTab("inactive")}>Inactive <span className="tn">{rules.filter((r) => !r.enabled).length}</span></span>
            <span className="dt-search"><img src={`${IC}magnifying-glass-bold.svg`} alt="" />
              <input placeholder="Search rules…" value={q} onChange={(e) => setQ(e.target.value)}
                     style={{ border: 0, outline: 0, background: "transparent", fontSize: 10.5, flex: 1, color: "var(--ink)" }} /></span>
          </div>
          <div className="dtable">
            <div className="dtr dth">
              <span className="dt-c-rule">Rule</span><span className="dt-c-trig">Example trigger</span>
              <span className="dt-c-rsp">Reply preview</span><span className="dt-c-use">Usage</span>
              <span className="dt-c-st">Status</span><span />
            </div>
            {shown.map((r) => (
              <div key={r.id} className={`dtr${selFresh?.id === r.id ? " dtsel" : ""}${r.enabled ? "" : " off-rule"}`}
                   style={r.enabled ? undefined : { opacity: 0.6 }}
                   onClick={() => setSel(r)}>
                <span className="dt-c-rule"><span className="dt-chk" /><span className="dt-rulecell">
                  <span className="r1"><b>{r.name}</b></span>
                  <span className="chips">{r.keywords.slice(0, 2).map((k, i) => <span className="kch" key={i}>{k}</span>)}{r.keywords.length > 2 && <span className="kch more">+{r.keywords.length - 2}</span>}</span>
                </span></span>
                <span className="dt-c-trig">“{r.keywords[0]}…”</span>
                <span className="dt-c-rsp">{r.reply.slice(0, 60)}{r.reply.length > 60 ? "…" : ""}</span>
                <span className="dt-c-use"><b>{r.fired_count}</b><small> total</small></span>
                <span className="dt-c-st"><span className={`tgl${r.enabled ? " on" : ""}`}
                      onClick={(e) => { e.stopPropagation(); void saveRule({ id: r.id, enabled: !r.enabled }); }} /></span>
                <span className="dt-dots"><img src={`${IC}dots-three-bold.svg`} alt=""
                      onClick={(e) => { e.stopPropagation(); if (confirm(`Delete rule "${r.name}"?`)) { void fetch(`/api/automation/rules/${r.id}`, { method: "DELETE" }).then(() => { if (selFresh?.id === r.id) setSel(null); void load(); }); } }} /></span>
              </div>
            ))}
            <div className="empty-add" style={{ cursor: "pointer" }} onClick={() => void saveRule({ name: `New rule ${rules.length + 1}`, keywords: ["example"], reply: "Thanks for reaching out! Someone from our team will reply here shortly." })}>
              + Add keyword rule
            </div>
          </div>
        </section>

        {/* HOURS + FAQ bottom row */}
        <div className="mcol">
          <section className="a-hrs">
            <div className="h-head">
              <img src={`${IC}clock-user-bold.svg`} alt="" /><b>Business hours</b>
              <span className={`tgl${settings?.away_enabled ? " on" : ""}`}
                    onClick={() => void fetch("/api/automation/settings", { method: "PUT", headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ awayEnabled: !(settings?.away_enabled ?? false) }) }).then(() => load())} />
            </div>
            <div className="days">
              {DAYS.map((d) => {
                const open = !!settings?.business_hours?.[d];
                return (
                  <span key={d} className={`dcell${open ? " on" : ""}`}
                        title={open ? settings.business_hours[d].join("–") : "Closed"}
                        onClick={() => {
                          const hrs = { ...(settings?.business_hours ?? {}) };
                          if (hrs[d]) delete hrs[d]; else hrs[d] = ["09:00", "18:00"];
                          void fetch("/api/automation/settings", { method: "PUT", headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ businessHours: hrs }) }).then(() => load());
                        }}>{dayShort(d)}</span>
                );
              })}
            </div>
            {settings?.away_enabled && (
              <div className="away-line">
                <img src={`${IC}moon-bold.svg`} alt="" />
                <span>Away · after hours — “{settings.away_text ?? "We're closed right now — we'll reply in the morning."}”</span>
                <span className="addlink" onClick={() => {
                  const t = prompt("Away message:", settings?.away_text ?? "") ?? "";
                  if (t) void fetch("/api/automation/settings", { method: "PUT", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ awayText: t.slice(0, 1024) }) }).then(() => load());
                }}>edit</span>
              </div>
            )}
          </section>
          <section className="a-hn">
            <div className="h-head">
              <img src={`${IC}question-bold.svg`} alt="" /><b>FAQ auto-replies</b>
              <span className="chip" style={{ fontSize: 8.5, padding: "1px 7px" }}>suggested only</span>
            </div>
            {faq.map((f) => (
              <div className="frow-s" key={f.id}>
                <span className="fq">{f.question}</span>
                <span className="fa">{f.answer.slice(0, 40)}…</span>
                <span className="addlink" onClick={() => void fetch(`/api/automation/faq/${f.id}`, { method: "DELETE" }).then(() => load())}>remove</span>
              </div>
            ))}
            <div className="empty-add" style={{ cursor: "pointer" }} onClick={() => {
              const question = prompt("FAQ question:");
              const answer = question ? prompt("Answer:") : null;
              if (question && answer) void fetch("/api/automation/faq", { method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ question, answer }) }).then(() => load());
            }}>+ Add FAQ pair</div>
            <div className="hint" style={{ fontSize: 9.5, color: "var(--ink-3)", marginTop: 8 }}>
              Human handoff — reply manually and automation pauses for that chat.
            </div>
          </section>
        </div>
      </div>

      {/* INSPECTOR */}
      <aside className={`insp${selFresh ? "" : " empty"}`} aria-label="Rule inspector">
        {!selFresh ? (
          <div className="insp-body" style={{ display: "grid", placeItems: "center", color: "var(--ink-3)", fontSize: 11 }}>
            Pick a rule to edit — or add one from the table.
          </div>
        ) : (
          <>
            <div className="insp-head">
              <b>{selFresh.name}</b>
              <span className="st-pill on">{selFresh.enabled ? "Active" : "Paused"}</span>
              <span className="tgl on" onClick={(e) => { e.stopPropagation(); void saveRule({ id: selFresh.id, enabled: !selFresh.enabled }); }} />
            </div>
            <div className="insp-body">
              <div className="insp-sec">
                <div className="insp-lb">Keywords <em>· contains match, case-insensitive</em></div>
                <div className="kch-edit">
                  {selFresh.keywords.map((k, i) => (
                    <span className="kch" key={i} onClick={() => {
                      const rest = selFresh.keywords.filter((_, j) => j !== i);
                      if (rest.length > 0) void saveRule({ id: selFresh.id, keywords: rest });
                    }}>{k} <b>×</b></span>
                  ))}
                  <span className="kch-add" onClick={() => {
                    const k = prompt("Add keyword:")?.trim();
                    if (k) void saveRule({ id: selFresh.id, keywords: [...selFresh.keywords, k] });
                  }}>+ Add</span>
                </div>
              </div>
              <div className="insp-sec">
                <div className="insp-lb">Reply message</div>
                <div className="insp-reply">
                  <textarea defaultValue={selFresh.reply} key={selFresh.id + selFresh.reply}
                            onBlur={(e) => { if (e.target.value !== selFresh.reply) void saveRule({ id: selFresh.id, reply: e.target.value }); }}
                            style={{ width: "100%", minHeight: 72, border: 0, outline: 0, background: "transparent", fontSize: 11.5, color: "var(--ink)", resize: "vertical" }} />
                  <small>{selFresh.reply.length}/1024</small>
                </div>
              </div>
              <div className="insp-sec">
                <div className="insp-lb">Match behavior</div>
                <div className="beh-row"><span>Send once per conversation</span><span className={`tgl${selFresh.send_once ? " on" : ""}`} onClick={() => void saveRule({ id: selFresh.id, send_once: !selFresh.send_once } as Partial<Rule>)} /></div>
              </div>
              <div className="insp-sec">
                <div className="isp-stats">
                  <div><b>{selFresh.fired_count}</b><span>fired</span></div>
                  <div><b>{log.filter((l) => l.rule_id === selFresh.id && l.status === "sent").length}</b><span>sent</span></div>
                  <div><b>{log.filter((l) => l.rule_id === selFresh.id && l.type === "paused").length}</b><span>paused</span></div>
                  <div><b>{log.filter((l) => l.rule_id === selFresh.id && l.status === "failed").length}</b><span>errors</span></div>
                </div>
              </div>
              <div className="insp-sec">
                <div className="insp-lb">Test rule <em>· simulate, doesn't send</em></div>
                <div className="test-in">
                  <input placeholder="“what's the price for a 5-page site?”" value={testText}
                         onChange={(e) => setTestText(e.target.value)}
                         style={{ border: 0, outline: 0, background: "transparent", fontSize: 11, flex: 1, color: "var(--ink)" }} />
                  <button className="btn btn-chat" style={{ minHeight: 24, padding: "0 9px", fontSize: 9.5 }} onClick={() => void testRule()}>Test</button>
                </div>
                {testRes && <div className="test-res">{testRes}</div>}
              </div>
            </div>
          </>
        )}
      </aside>
      {note && <div style={{ position: "fixed", bottom: 18, left: "50%", transform: "translateX(-50%)", background: "var(--card)", border: "1px solid var(--line)", borderRadius: 999, padding: "7px 14px", fontSize: 11, zIndex: 60 }}>{note}</div>}
    </div>
  );
}
