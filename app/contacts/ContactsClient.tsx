"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Contacts master-detail — ported 1:1 from contacts/wireframe.html:
 * klist (pills + search + krows) | kdetail (profile + details + history link).
 * Real data via /api/contacts. Tags CRUD + manual add land with S3/P2
 * surface work; unknown inbound senders auto-created by the webhook show here.
 */
type Ct = {
  id: string; wa_id: string; name: string | null; opt_in: boolean;
  created_at: string; preview: string | null; last_at: string | null; conv_id: string | null;
};

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

export function ContactsClient() {
  const [q, setQ] = useState("");
  const [list, setList] = useState<Ct[]>([]);
  const [sel, setSel] = useState<Ct | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/contacts");
    const data = (await res.json().catch(() => null)) as { contacts?: Ct[] } | null;
    setList((data?.contacts ?? []).filter(
      (c) => !q || (c.name ?? "").toLowerCase().includes(q.toLowerCase()) || c.wa_id.includes(q),
    ));
  }, [q]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="contacts" data-testid="contacts">
      <section className="klist" aria-label="Contacts">
        <div className="klist-head">
          <div className="kpills">
            <span className="chip on">All contacts <span className="n">{list.length}</span></span>
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
            <div key={c.id} className={`krow${sel?.id === c.id ? " on" : ""}`} data-testid="krow" onClick={() => setSel(c)}>
              <div className="av av-36" style={{ background: hueFor(c.wa_id), position: "relative" }}>
                {initialsOf(c.name, c.wa_id)}{(c.last_at && Date.now() - new Date(c.last_at).getTime() < 86400000) && <span className="st" />}
              </div>
              <div className="t">
                <div className="r1"><b>{c.name ?? "+" + c.wa_id}</b><span className="num">+{c.wa_id}</span></div>
                <div className="r2">
                  <span className="tags">{c.preview && <span className="mini cust">{c.preview.slice(0, 42)}</span>}</span>
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
        <div className="kd-head"><b>Contact</b></div>
        {!sel ? (
          <div style={{ padding: "24px 16px", color: "var(--ink-3)", fontSize: "11px" }}>
            Pick a contact to see their profile.
          </div>
        ) : (
          <div className="kd-body">
            <div className="phead">
              <div className="av av-52" style={{ background: hueFor(sel.wa_id) }}>{initialsOf(sel.name, sel.wa_id)}</div>
              <div className="nm">{sel.name ?? "+" + sel.wa_id}</div>
              <div className="ph">+{sel.wa_id}</div>
              <div className="src">Created {new Date(sel.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · auto-created from WhatsApp</div>
            </div>
            <div className="psec">
              <div className="st"><span className="mlab">Details</span></div>
              <div className="kv">
                <div><div className="k">WhatsApp number</div><div className="v">+{sel.wa_id}</div></div>
                <div><div className="k">Marketing opt-in</div><div className="v"><span className={`chip ${sel.opt_in ? "chip-tag" : "chip-warn"}`}>{sel.opt_in ? "Yes" : "No"}</span></div></div>
                <div><div className="k">Eligible for broadcast</div><div className="v"><span className={`chip ${sel.opt_in ? "chip-tag" : "chip-warn"}`}>{sel.opt_in ? "Yes" : "No"}</span></div></div>
                <div><div className="k">Last activity</div><div className="v">{sel.last_at ? timeAgo(sel.last_at) + " ago" : "—"}</div></div>
              </div>
            </div>
            <div className="psec">
              <div className="st"><span className="mlab">Conversation</span></div>
              <div className="kv"><div><div className="k">Last message</div><div className="v">{sel.preview ?? "—"}</div></div></div>
              {sel.conv_id && (
                <a className="btn btn-chat" style={{ marginTop: 8 }} href="/inbox" data-testid="open-in-inbox">
                  Open in inbox
                </a>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
