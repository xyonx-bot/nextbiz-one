"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Inbox 3-col surface — ported 1:1 from Mira's inbox/wireframe.html:
 * threads / thread / contact panel; WhatsApp-DNA bubbles in one sunken
 * stream well. 24h composer dual state: inside window = free text; outside
 * = blocked banner + template prompt (templates land in S2).
 * Real data via /api/conversations, thread, mark-read, send.
 */
type Conv = {
  id: string; wa_id: string; name: string | null;
  preview: string | null; unread: number; last_inbound_at: string | null;
};
type Msg = { id: string; direction: "in" | "out"; body: string | null; status: string; created_at: string };
type Thread = {
  conversation: { id: string; waId: string; name: string | null; optIn: boolean; windowOpen: boolean };
  messages: Msg[];
};

const HUES = ["var(--chat)", "var(--ads)", "var(--social)", "var(--info)", "#7C6A46", "#4E5D78", "#6B4E78"];

function initialsOf(name: string | null, waId: string) {
  return (name ?? waId).replace(/[^a-zA-Z0-9 ]/g, "").trim().split(/\s+/).map((s) => s[0]).join("").slice(0, 2).toUpperCase() || "?";
}
function hueFor(waId: string) {
  let h = 0;
  for (const ch of waId) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return HUES[h % HUES.length];
}
function timeAgo(iso: string | null) {
  if (!iso) return "";
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "now";
  if (m < 60) return m + "m";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h";
  return Math.floor(h / 24) + "d";
}
function clockTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

export function InboxClient() {
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [q, setQ] = useState("");
  const [convs, setConvs] = useState<Conv[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [thread, setThread] = useState<Thread | null>(null);
  const [draft, setDraft] = useState("");
  const [sendErr, setSendErr] = useState("");
  const [sending, setSending] = useState(false);

  const loadList = useCallback(async () => {
    const res = await fetch(`/api/conversations?unread=${filter === "unread" ? 1 : 0}`);
    const data = (await res.json().catch(() => null)) as { conversations?: Conv[] } | null;
    const list = (data?.conversations ?? []).filter(
      (c) => !q || (c.name ?? "").toLowerCase().includes(q.toLowerCase()) || c.wa_id.includes(q),
    );
    setConvs(list);
  }, [filter, q]);

  useEffect(() => { void loadList(); }, [loadList]);

  const open = useCallback(async (id: string) => {
    setSelected(id);
    const res = await fetch(`/api/conversations/${id}`);
    const data = (await res.json().catch(() => null)) as Thread | null;
    if (data) {
      setThread(data);
      await fetch(`/api/conversations/${id}/read`, { method: "POST" });
      void loadList();
    }
  }, [loadList]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !draft.trim()) return;
    setSending(true);
    setSendErr("");
    try {
      const res = await fetch(`/api/conversations/${selected}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: draft }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !data?.ok) {
        setSendErr(data?.error ?? "Couldn't send — try again.");
      } else {
        setDraft("");
        await open(selected);
      }
    } finally {
      setSending(false);
    }
  }

  const sel = thread?.conversation;

  return (
    <div className="inbox">
      <section className="clist" aria-label="Conversations">
        <div className="clist-head">
          <div className="pills">
            <span className={`chip${filter === "all" ? " on" : ""}`} onClick={() => setFilter("all")}>All</span>
            <span className={`chip${filter === "unread" ? " on" : ""}`} onClick={() => setFilter("unread")}>Unread</span>
          </div>
          <div className="lsearch">
            <img src="https://cdn.joyverse.fun/mira-assets/phosphor/bold/magnifying-glass-bold.svg" alt="" />
            <input
              data-testid="inbox-search"
              placeholder="Search conversations…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ border: 0, outline: "none", background: "transparent", width: "100%", fontSize: "11.5px", color: "var(--ink)" }}
            />
          </div>
        </div>
        <div className="crows" data-testid="thread-list">
          {convs.length === 0 && (
            <div style={{ padding: "20px 14px", color: "var(--ink-3)", fontSize: "11px" }}>
              No conversations yet — they appear here when a WhatsApp message arrives.
            </div>
          )}
          {convs.map((c) => (
            <div key={c.id} className={`crow${selected === c.id ? " on" : ""}`} data-testid="crow" onClick={() => void open(c.id)}>
              <div className="av av-36" style={{ background: hueFor(c.wa_id), position: "relative" }}>
                {initialsOf(c.name, c.wa_id)}{c.unread > 0 && <span className="st" />}
              </div>
              <div className="t">
                <div className="r1"><b>{c.name ?? c.wa_id}</b><span className="time">{timeAgo(c.last_inbound_at)}</span></div>
                <div className="r2"><span className="prev">{c.preview ?? "—"}</span>{c.unread > 0 && <span className="unread" />}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="thread" aria-label="Conversation">
        {!sel ? (
          <div style={{ display: "grid", placeItems: "center", height: "100%", color: "var(--ink-3)", fontSize: "11.5px" }}>
            Pick a conversation to see the thread.
          </div>
        ) : (
          <>
            <div className="thead">
              <div className="av av-36" style={{ background: hueFor(sel.waId) }}>{initialsOf(sel.name, sel.waId)}</div>
              <div className="tt"><b>{sel.name ?? sel.waId}</b><span>+{sel.waId} · {sel.windowOpen ? "Active now" : "Outside 24h window"}</span></div>
              <button className="iconbtn" aria-label="Contact info"><img src="https://cdn.joyverse.fun/mira-assets/phosphor/bold/images-bold.svg" alt="" /></button>
              <button className="iconbtn" aria-label="More"><img src="https://cdn.joyverse.fun/mira-assets/phosphor/bold/dots-three-bold.svg" alt="" /></button>
            </div>
            <div className="stream" data-testid="stream">
              {thread.messages.map((m) => (
                <div key={m.id} className={`msg ${m.direction}`}>
                  <div className="bub">{m.body}</div>
                  <div className="meta">
                    <span>{clockTime(m.created_at)}</span>
                    {m.direction === "out" && (
                      <img
                        src={m.status === "read"
                          ? "https://cdn.joyverse.fun/mira-assets/phosphor/bold/checks-bold.svg"
                          : "https://cdn.joyverse.fun/mira-assets/phosphor/bold/check-bold.svg"}
                        alt={m.status}
                        className={m.status === "sent" || m.status === "delivered" ? "grey" : ""}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
            {sel.windowOpen ? (
              <form className="composer" onSubmit={send}>
                <button type="button" className="iconbtn" aria-label="Attach"><img src="https://cdn.joyverse.fun/mira-assets/phosphor/bold/paperclip-bold.svg" alt="" /></button>
                <div className="fld">
                  <input data-testid="composer-input" placeholder="Type a message…" value={draft} onChange={(e) => setDraft(e.target.value)} />
                  <img src="https://cdn.joyverse.fun/mira-assets/phosphor/bold/smiley-bold.svg" alt="" width="15" height="15" style={{ color: "var(--ink-3)", cursor: "pointer" }} />
                </div>
                <button type="submit" className="iconbtn send" aria-label="Send" disabled={sending} data-testid="send-btn">
                  <img src="https://cdn.joyverse.fun/mira-assets/phosphor/bold/paper-plane-tilt-bold.svg" alt="" />
                </button>
              </form>
            ) : (
              <div className="state-note" style={{ display: "block", padding: "14px" }}>
                <div className="blocked"><img src="https://cdn.joyverse.fun/mira-assets/phosphor/bold/warning-circle-bold.svg" alt="" />Free-text is blocked — send an approved template to restart the conversation.</div>
                <div className="tplrow"><span className="chip chip-info">Templates arrive in S2</span></div>
              </div>
            )}
            {sendErr && <div className="blocked" style={{ margin: "0 14px 12px" }}><img src="https://cdn.joyverse.fun/mira-assets/phosphor/bold/warning-circle-bold.svg" alt="" />{sendErr}</div>}
          </>
        )}
      </section>

      <aside className="cpanel" aria-label="Contact details">
        <div className="ptabs"><span className="ptab on">Contact</span><span className="ptab">Notes</span><span className="ptab">Activity</span></div>
        <div className="pbody">
          {sel ? (
            <>
              <div className="phead">
                <div className="av av-52" style={{ background: hueFor(sel.waId) }}>{initialsOf(sel.name, sel.waId)}</div>
                <div className="nm">{sel.name ?? sel.waId} <img src="https://cdn.joyverse.fun/mira-assets/phosphor/bold/check-circle-bold.svg" alt="On WhatsApp" /></div>
                <div className="ph">+{sel.waId}</div>
                <div className="src">{sel.optIn ? "Marketing opt-in" : "No marketing opt-in"}</div>
              </div>
              <div className="psec">
                <div className="st"><span className="mlab">Messaging</span></div>
                <div className="kv">
                  <div><div className="k">24h window</div><div className="v">{sel.windowOpen ? <span className="chip chip-tag">Open</span> : <span className="chip chip-warn">Closed</span>}</div></div>
                  <div><div className="k">Eligible for broadcast</div><div className="v">{sel.optIn ? <span className="chip chip-tag">Yes</span> : <span className="chip chip-warn">No</span>}</div></div>
                </div>
              </div>
            </>
          ) : (
            <div style={{ padding: "20px 14px", color: "var(--ink-3)", fontSize: "11px" }}>Select a conversation to see contact details.</div>
          )}
        </div>
      </aside>
    </div>
  );
}
