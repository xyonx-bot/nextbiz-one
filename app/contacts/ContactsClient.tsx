"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Contacts master-detail — ported 1:1 from contacts/wireframe.html:
 * klist (pills + search + krows with tags/opt-in/auto badges) | kdetail
 * (kd-head with actions · kd-fields profile cards · khist timeline ·
 * kempty). Real data via /api/contacts; history timeline reuses
 * /api/conversations/[id]. Mobile master→detail via body.show-detail.
 */
type Ct = {
  id: string; wa_id: string; name: string | null; opt_in: boolean;
  created_at: string; preview: string | null; last_at: string | null; conv_id: string | null;
  tags: string[]; company: string | null; location: string | null;
  interested_in: string | null; budget: string | null;
};
type HMsg = { id: string; direction: string; body: string | null; created_at: string };

const HUES = ["var(--chat)", "var(--ads)", "var(--social)", "var(--info)", "#7C6A46", "#4E5D78", "#6B4E78"];

function initialsOf(name: string | null, waId: string) {
  return (name ?? waId).replace(/[^a-zA-Z0-9 ]/g, "").trim().split(/\s+/).map((s) => s[0]).join("").slice(0, 2).toUpperCase() || "?";
}
function hueFor(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 997;
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
function fmtWhen(iso: string) {
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function ContactsClient() {
  const [q, setQ] = useState("");
  const [list, setList] = useState<Ct[]>([]);
  const [sel, setSel] = useState<Ct | null>(null);
  const [history, setHistory] = useState<HMsg[]>([]);

  const load = useCallback(async () => {
    const res = await fetch("/api/contacts");
    const data = (await res.json().catch(() => null)) as { contacts?: Ct[] } | null;
    setList((data?.contacts ?? []).filter(
      (c) => !q || (c.name ?? "").toLowerCase().includes(q.toLowerCase()) || c.wa_id.includes(q),
    ));
  }, [q]);

  useEffect(() => { void load(); }, [load]);

  // Wireframe body-state class (mobile master→detail) — cleaned up on unmount.
  useEffect(() => {
    return () => document.body.classList.remove("show-detail");
  }, []);

  const pick = useCallback(async (c: Ct) => {
    setSel(c);
    if (window.innerWidth < 640) document.body.classList.add("show-detail");
    setHistory([]);
    if (c.conv_id) {
      const res = await fetch(`/api/conversations/${c.conv_id}`);
      const data = (await res.json().catch(() => null)) as { messages?: HMsg[] } | null;
      setHistory((data?.messages ?? []).slice(-8).reverse());
    }
  }, []);

  const hasTags = list.some((c) => c.tags.length > 0);
  const tagChip = (t: string) =>
    ["lead", "customer"].includes(t.toLowerCase())
      ? <span key={t} className={`mini ${t.toLowerCase()}`}>{t}</span>
      : <span key={t} className="mini cust">{t}</span>;

  return (
    <div className="contacts" data-testid="contacts">
      <section className="klist" aria-label="Contacts">
        <div className="klist-head">
          <div className="kpills">
            <span className="chip on">All <span className="n">{list.length}</span></span>
            <span className="chip">Opted-in <span className="n">{list.filter((c) => c.opt_in).length}</span></span>
            {hasTags && <span className="chip">Leads <span className="n">{list.filter((c) => c.tags.some((t) => t.toLowerCase() === "lead")).length}</span></span>}
            {hasTags && <span className="chip">Customers <span className="n">{list.filter((c) => c.tags.some((t) => t.toLowerCase() === "customer")).length}</span></span>}
          </div>
          <div className="ksearch">
            <img src="https://cdn.joyverse.fun/mira-assets/phosphor/bold/magnifying-glass-bold.svg" alt="" />
            <input
              data-testid="contacts-search"
              placeholder="Search name, number, tag…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ border: 0, outline: "none", background: "transparent", flex: 1, fontSize: "11.5px", color: "var(--ink)" }}
            />
          </div>
        </div>
        <div className="krows">
          {list.length === 0 && (
            <div style={{ padding: "20px 14px", color: "var(--ink-3)", fontSize: "11px" }}>
              No contacts yet — they appear when a WhatsApp message arrives.
            </div>
          )}
          {list.map((c) => (
            <div key={c.id} className={`krow${sel?.id === c.id ? " on" : ""}`} data-testid="krow" onClick={() => void pick(c)}>
              <div className="av av-36" style={{ background: hueFor(c.wa_id), position: "relative" }}>
                {initialsOf(c.name, c.wa_id)}{(c.last_at && Date.now() - new Date(c.last_at).getTime() < 86400000) && <span className="st" />}
              </div>
              <div className="t">
                <div className="r1"><b>{c.name ?? "+" + c.wa_id}</b><span className="num">+{c.wa_id}</span></div>
                <div className="r2">
                  <span className="tags">{c.tags.slice(0, 2).map(tagChip)}</span>
                  {!c.name && <span className="autob">Auto</span>}
                  <span className={`opt ${c.opt_in ? "y" : "n"}`}>
                    <img src={`https://cdn.joyverse.fun/mira-assets/phosphor/bold/${c.opt_in ? "check-bold" : "x-bold"}.svg`} alt="" />
                    {c.opt_in ? "Opted in" : "No opt-in"}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="kdetail" aria-label="Contact details">
        {!sel ? (
          <div className="kempty" data-testid="kempty">
            <div>
              <div className="ic"><img src="https://cdn.joyverse.fun/mira-assets/phosphor/bold/users-bold.svg" alt="" /></div>
              <b>Pick a contact</b>
              <p>Select someone from the list to see their profile, details and conversation history.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="kd-head">
              <button className="back" onClick={() => document.body.classList.remove("show-detail")} aria-label="Back" data-testid="kdetail-back">
                <img src="https://cdn.joyverse.fun/mira-assets/phosphor/bold/arrow-left-bold.svg" alt="" />
              </button>
              <div className="av av-52" style={{ background: hueFor(sel.wa_id) }}>{initialsOf(sel.name, sel.wa_id)}</div>
              <div className="id">
                <div className="nm">{sel.name ?? "+" + sel.wa_id} <img src="https://cdn.joyverse.fun/mira-assets/phosphor/bold/check-circle-bold.svg" alt="On WhatsApp" /></div>
                <div className="sub">
                  <span>+{sel.wa_id}</span>
                  <span>·</span>
                  <span>Created {new Date(sel.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                  {!sel.name && <span className="chip chip-info" style={{ fontSize: 8.5, padding: "1px 6px" }}>auto-created</span>}
                </div>
              </div>
              <div className="acts">
                <a className="btn btn-soft" href="/inbox" data-testid="open-in-inbox">Open in inbox</a>
                <a className="btn btn-chat" href="/inbox">Message</a>
              </div>
            </div>
            <div className="kd-body">
              <div className="kd-sec">
                <div className="st"><span className="mlab">Details</span></div>
                <div className="kd-fields">
                  <div className="f"><div className="k">WhatsApp number</div><div className="v">+{sel.wa_id}</div></div>
                  <div className="f"><div className="k">Company</div><div className="v mut">{sel.company ?? "—"}</div></div>
                  <div className="f"><div className="k">Location</div><div className="v mut">{sel.location ?? "—"}</div></div>
                  <div className="f"><div className="k">Interested in</div><div className="v mut">{sel.interested_in ?? "—"}</div></div>
                  <div className="f"><div className="k">Budget</div><div className="v mut">{sel.budget ?? "—"}</div></div>
                  <div className="f"><div className="k">Last activity</div><div className="v mut">{sel.last_at ? timeAgo(sel.last_at) + " ago" : "—"}</div></div>
                  <div className="f"><div className="k">Marketing opt-in</div><div className="v"><span className={`chip ${sel.opt_in ? "chip-tag" : "chip-warn"}`}>{sel.opt_in ? "Yes" : "No"}</span></div></div>
                  <div className="f"><div className="k">Eligible for broadcast</div><div className="v"><span className={`chip ${sel.opt_in ? "chip-tag" : "chip-warn"}`}>{sel.opt_in ? "Yes" : "No"}</span></div></div>
                  {sel.tags.length > 0 && (
                    <div className="f"><div className="k">Tags</div><div className="v"><span className="tags-row">{sel.tags.map((t) => <span key={t} className="chip chip-tag" style={{ fontSize: 9, padding: "1px 8px" }}>{t}</span>)}</span></div></div>
                  )}
                </div>
              </div>
              <div className="kd-sec">
                <div className="st"><span className="mlab">History</span></div>
                <div className="khist" data-testid="khist">
                  <div className="kh-row">
                    <div className="tl"><span className="dot" /><span className="bar" /></div>
                    <div className="t"><b>Contact created</b><span>Auto-created from an inbound WhatsApp message.</span><span className="when">{fmtWhen(sel.created_at)}</span></div>
                  </div>
                  {history.length === 0 && (
                    <div style={{ fontSize: "10.5px", color: "var(--ink-3)", padding: "4px 0 4px 18px" }}>No messages yet.</div>
                  )}
                  {history.map((m, i) => (
                    <div className="kh-row" key={m.id}>
                      <div className="tl"><span className="dot" />{i < history.length - 1 && <span className="bar" />}</div>
                      <div className="t">
                        <b>{m.direction === "in" ? "Message received" : "Message sent"}</b>
                        <span>{m.body ?? "—"}</span>
                        <span className="when">{fmtWhen(m.created_at)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
