"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { avatarClass, fmtPhone, initials } from "@/lib/ui";

/**
 * Contacts — design v2 (nextbiz-one-v2/contacts): segments rail | data table (+ bulk bar) | profile drawer.
 * Segments are derived from real data (opt-in, activity, tags). Contacts are created automatically from
 * inbound WhatsApp messages; there is no manual add/import API yet, so the UI doesn't offer one.
 */
type Ct = {
  id: string; wa_id: string; name: string | null; opt_in: boolean;
  created_at: string; preview: string | null; last_at: string | null; conv_id: string | null;
  tags: string[]; company: string | null; location: string | null; interested_in: string | null; budget: string | null;
};
type HMsg = { id: string; direction: string; body: string | null; created_at: string };
type Seg = { key: string; label: string; icon?: string; sw?: string; test: (c: Ct) => boolean };

const WEEK = 7 * 86400000;
const TAG_SW = ["var(--chat)", "var(--grape)", "var(--social)", "var(--banana)", "var(--ads)"];
const when = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso), days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days < 1 && d.toDateString() === new Date().toDateString()) return "Today " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
  if (days < 2) return "Yesterday";
  if (days < 7) return d.toLocaleDateString("en-GB", { weekday: "short" });
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};
const fmtWhen = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const tagColor = (t: string) => ({ lead: "green", customer: "grape", vip: "banana" } as Record<string, string>)[t.toLowerCase()] ?? "";

export function ContactsClient({ initialId }: { initialId?: string }) {
  const [list, setList] = useState<Ct[] | null>(null);
  const [q, setQ] = useState("");
  const [seg, setSeg] = useState("all");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [sel, setSel] = useState<Ct | null>(null);
  const [history, setHistory] = useState<HMsg[] | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/contacts", { cache: "no-store" });
    const data = (await res.json().catch(() => null)) as { contacts?: Ct[] } | null;
    setList(data?.contacts ?? []);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const openProfile = useCallback(async (c: Ct) => {
    setSel(c); setHistory(null);
    if (c.conv_id) {
      const res = await fetch(`/api/conversations/${c.conv_id}`, { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as { messages?: HMsg[] } | null;
      setHistory((data?.messages ?? []).slice(-8).reverse());
    } else setHistory([]);
  }, []);
  useEffect(() => {
    if (initialId && list) { const c = list.find((x) => x.id === initialId); if (c) void openProfile(c); }
  }, [initialId, list, openProfile]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && setSel(null);
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, []);

  const segs: Seg[] = useMemo(() => {
    const tags = Array.from(new Set((list ?? []).flatMap((c) => c.tags))).sort();
    return [
      { key: "all", label: "All contacts", icon: "users", test: () => true },
      { key: "opt", label: "Opted in", icon: "check-circle", test: (c) => c.opt_in },
      { key: "noopt", label: "Not opted in", icon: "prohibit", test: (c) => !c.opt_in },
      { key: "week", label: "Active this week", icon: "clock", test: (c) => !!c.last_at && Date.now() - new Date(c.last_at).getTime() < WEEK },
      ...tags.map((t, i) => ({ key: "tag:" + t, label: t, sw: TAG_SW[i % TAG_SW.length], test: (c: Ct) => c.tags.includes(t) })),
    ];
  }, [list]);
  const cur = segs.find((s) => s.key === seg) ?? segs[0];
  const rows = useMemo(() => {
    const n = q.trim().toLowerCase(), digits = n.replace(/\D/g, "");
    return (list ?? []).filter(cur.test).filter((c) => !n || (c.name ?? "").toLowerCase().includes(n) || (digits && c.wa_id.includes(digits)) || c.tags.some((t) => t.toLowerCase().includes(n)));
  }, [list, cur, q]);
  const total = list?.length ?? 0, opted = (list ?? []).filter((c) => c.opt_in).length;
  const togglePick = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allPicked = rows.length > 0 && rows.every((r) => picked.has(r.id));
  const pickedOpted = (list ?? []).filter((c) => picked.has(c.id) && c.opt_in).length;

  return (
    <div className="pg-contacts" style={{ height: "100%" }}>
      <div className="wrapc" data-state={list && list.length === 0 ? "empty" : "full"} data-testid="contacts">
        <aside className="card segs" aria-label="Segments">
          {segs.map((s, i) => (
            <div key={s.key} style={{ display: "contents" }}>
              {i === 0 && <div className="grp eyebrow">Segments</div>}
              {s.key.startsWith("tag:") && !segs[i - 1].key.startsWith("tag:") && <div className="grp eyebrow">Tags</div>}
              <a className={`seg-i${seg === s.key ? " on" : ""}`} onClick={() => setSeg(s.key)} role="button" tabIndex={0}>
                {s.icon ? <Icon name={s.icon} size="sm" /> : <span className="sw" style={{ background: s.sw }} />}
                <span className="trunc">{s.label}</span><span className="n">{(list ?? []).filter(s.test).length}</span>
              </a>
            </div>
          ))}
          <div className="optin-card"><b>Broadcast reach</b>{opted} of {total} contacts can receive broadcasts.<div className="meter"><span style={{ width: `${total ? (opted / total) * 100 : 0}%` }} /></div>Others can opt in by replying <b style={{ display: "inline", fontSize: "inherit" }}>START</b>.</div>
        </aside>

        <section className={`card tcard${picked.size ? " has-sel" : ""}`}>
          <div className="toolbar">
            <label className="search"><Icon name="magnifying-glass" size="sm" /><input placeholder="Search name, number or tag" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search contacts" data-testid="contacts-search" /></label>
            <div className="chips mob-only">
              {segs.slice(0, 3).map((s) => <button key={s.key} className={`chip${seg === s.key ? " on" : ""}`} onClick={() => setSeg(s.key)}>{s.key === "all" ? "All" : s.label} <span className="n">{(list ?? []).filter(s.test).length}</span></button>)}
            </div>
            <span className="sp" />
            <span className="xs faint hide-s" style={{ fontWeight: 600 }}>Contacts are added automatically when someone messages you</span>
          </div>
          <div className="bulk"><button className={`check${allPicked ? " on" : ""}`} onClick={() => setPicked(new Set())} aria-label="Clear selection" /><span>{picked.size} selected</span><span className="sp" />
            <span className="xs" style={{ fontWeight: 600, opacity: .8 }}>{pickedOpted} opted in</span>
            <a className={`btn btn-primary${pickedOpted ? "" : " is-disabled"}`} href={`/broadcasts?new=1&to=${Array.from(picked).join(",")}`}><Icon name="megaphone" />Broadcast</a></div>
          <div className="tscroll">
            <table className="dt">
              <thead><tr>
                <th className="ck-col"><button className={`check${allPicked ? " on" : ""}`} aria-label="Select all" onClick={() => setPicked(allPicked ? new Set() : new Set(rows.map((r) => r.id)))} /></th>
                <th>Contact</th><th className="col-tags">Tags</th><th className="col-opt">Broadcasts</th><th className="col-src">Company</th><th className="col-last">Last message</th><th />
              </tr></thead>
              <tbody>
                {list === null && [1, 2, 3, 4].map((k) => <tr key={k}><td colSpan={7}><span className="sk" style={{ display: "block", height: 28 }} /></td></tr>)}
                {rows.map((c) => (
                  <tr key={c.id} data-testid="krow" className={sel?.id === c.id ? "on" : ""} onClick={() => void openProfile(c)}>
                    <td className="ck-col" onClick={(e) => { e.stopPropagation(); togglePick(c.id); }}><span className={`check${picked.has(c.id) ? " on" : ""}`} role="checkbox" aria-checked={picked.has(c.id)} /></td>
                    <td><div className="who"><span className={`av sm ${avatarClass(c.wa_id)}`}>{initials(c.name, c.wa_id)}</span><span className="trunc"><b>{c.name ?? fmtPhone(c.wa_id)}</b><small>{fmtPhone(c.wa_id)}</small></span></div></td>
                    <td className="col-tags"><div className="row gap-4">{c.tags.length ? c.tags.slice(0, 3).map((t) => <span key={t} className={`tag ${tagColor(t)}`}>{t}</span>) : <span className="faint xs">—</span>}</div></td>
                    <td className="col-opt">{c.opt_in ? <span className="pill ok sm">Opted in</span> : <span className="pill neutral sm">Not opted in</span>}</td>
                    <td className="col-src"><span className="src">{c.company ?? <span className="faint">—</span>}</span></td>
                    <td className="col-last"><span className="last">{when(c.last_at ?? c.created_at)}</span></td>
                    <td className="col-act r"><Icon name="caret-right" style={{ color: "var(--ink-4)" }} /></td>
                  </tr>
                ))}
                {list !== null && rows.length === 0 && total > 0 && <tr><td colSpan={7}><div className="empty"><p>No contacts match this filter.</p></div></td></tr>}
              </tbody>
            </table>
          </div>
          <div className="tfoot"><span>{rows.length} of {total} contacts</span></div>
          <div className="empty zero-c" style={{ flex: 1 }}>
            <div className="art"><Icon name="users-three" /></div>
            <h3>No contacts yet</h3>
            <p>Everyone who messages your WhatsApp number is added here automatically, with their opt-in status.</p>
            <div className="acts"><a className="btn btn-primary" href="/inbox"><Icon name="tray" />Go to inbox</a></div>
          </div>
        </section>
      </div>

      <div className={`scrim${sel ? " open" : ""}`} onClick={() => setSel(null)} />
      <aside className={`drawer${sel ? " open" : ""}`} aria-label="Contact profile" aria-hidden={!sel}>
        {sel && (
          <>
            <div className="pf-h">
              <span className={`av xl ${avatarClass(sel.wa_id)}`}>{initials(sel.name, sel.wa_id)}</span>
              <div className="grow"><h2 className="nm" data-testid="contact-name">{sel.name ?? fmtPhone(sel.wa_id)}</h2><div className="small muted num" style={{ fontWeight: 600 }}>{fmtPhone(sel.wa_id)}</div>
                {sel.tags.length > 0 && <div className="row gap-6 wrap" style={{ marginTop: 6 }}>{sel.tags.map((t) => <span key={t} className={`tag ${tagColor(t)}`}>{t}</span>)}</div>}</div>
              <button className="btn btn-ghost btn-icon" onClick={() => setSel(null)} aria-label="Close" style={{ alignSelf: "flex-start" }}><Icon name="x" /></button>
            </div>
            <div className="pf-acts" style={{ paddingTop: 14 }}>
              {sel.conv_id && <a className="btn btn-primary btn-sm" href="/inbox"><Icon name="chat-circle-dots" />Open chat</a>}
              {sel.opt_in && <a className="btn btn-soft btn-sm" href={`/broadcasts?new=1&to=${sel.id}`}><Icon name="megaphone" />Send template</a>}
            </div>
            <div className="pf-b">
              <div className="optbox" style={sel.opt_in ? undefined : { background: "var(--sunken)", borderColor: "var(--line-2)" }}>
                <span className={`icon-tile sm ${sel.opt_in ? "green" : "neutral"}`}><Icon name={sel.opt_in ? "check-circle" : "prohibit"} /></span>
                <span className="grow"><b style={sel.opt_in ? undefined : { color: "var(--ink)" }}>{sel.opt_in ? "Opted in to broadcasts" : "Not opted in"}</b>
                  <small style={sel.opt_in ? undefined : { color: "var(--ink-2)" }}>{sel.opt_in ? "Can receive broadcasts and offers" : "Only replies within the 24h window — they can opt in by replying START"}</small></span>
              </div>
              <div><div className="eyebrow" style={{ marginBottom: 10 }}>Details</div>
                <dl className="kv">
                  <dt>Company</dt><dd className={sel.company ? "" : "faint"}>{sel.company ?? "—"}</dd>
                  <dt>Location</dt><dd className={sel.location ? "" : "faint"}>{sel.location ?? "—"}</dd>
                  <dt>Interested in</dt><dd className={sel.interested_in ? "" : "faint"}>{sel.interested_in ?? "—"}</dd>
                  <dt>Budget</dt><dd className={sel.budget ? "" : "faint"}>{sel.budget ?? "—"}</dd>
                  <dt>Added</dt><dd>{fmtWhen(sel.created_at)} · automatically</dd>
                </dl></div>
              <div><div className="eyebrow" style={{ marginBottom: 12 }}>Recent messages</div>
                <div className="tl">
                  {history === null && <span className="sk" style={{ height: 40, display: "block" }} />}
                  {history?.length === 0 && <p className="xs faint" style={{ fontWeight: 600 }}>No messages yet.</p>}
                  {history?.map((m) => (
                    <div key={m.id}><span className={`icon-tile sm ${m.direction === "in" ? "green" : "grape"}`}><Icon name={m.direction === "in" ? "chat-circle-dots" : "paper-plane-tilt"} /></span>
                      <span>{m.direction === "in" ? "" : "You: "}{m.body ?? "(media)"}<small>{fmtWhen(m.created_at)}</small></span></div>
                  ))}
                </div></div>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
