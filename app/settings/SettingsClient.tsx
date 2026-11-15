"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";

/**
 * Settings — design v2 (nextbiz-one-v2/settings): sticky section nav + one scrolling column of cards.
 * Business name + display phone come FROM the WhatsApp connection (read-only). No billing, team or
 * analytics in v1. The word "WABA" never appears.
 */
type Profile = { name: string; about: string | null; connection: { display_name: string | null; status: string | null } | null };
type Session = { id: string; created_at: string; expires_at: string; current: boolean; user_agent?: string | null };
/** "Mozilla/5.0 (Linux; Android 14…) Chrome/131…" → ["Chrome on Android", "phone"] */
function device(ua?: string | null): [string, string] {
  if (!ua) return ["Unknown device", "globe"];
  const os = /iPhone|iPad/.test(ua) ? "iPhone" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "";
  const br = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /SamsungBrowser/.test(ua) ? "Samsung Internet" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : /HeadlessChrome|Playwright|node|curl/i.test(ua) ? "Script" : "Browser";
  return [os ? `${br} on ${os}` : br, /iPhone|Android|Mobile/.test(ua) ? "device-mobile" : "globe"];
}
const rel = (iso: string) => { const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000); return d <= 0 ? "today" : d === 1 ? "yesterday" : d < 30 ? `${d} days ago` : new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }); };
type IgAccount = { ig_user_id: string; username: string | null; display_name: string | null; scopes: string[]; live: boolean; updated_at: string;
  expires_at: string | null; webhook_subscribed?: boolean; last_error?: string | null; profile_picture_url?: string | null };

const SECTIONS: [string, string, string, string][] = [
  ["Workspace", "profile", "Business profile", "storefront"],
  ["Workspace", "whatsapp", "WhatsApp", "whatsapp-logo"],
  ["Workspace", "channels", "Other channels", "plugs-connected"],
  ["Account", "notifications", "Email", "envelope"],
  ["Account", "security", "Login & security", "shield-check"],
  ["Account", "data", "Your data", "database"],
];
const d8 = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export function SettingsClient({ email, displayName }: { email: string; displayName: string }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [ig, setIg] = useState<{ live: boolean; account: IgAccount | null } | null>(null);
  const [about, setAbout] = useState("");
  const [active, setActive] = useState("profile");
  const [confirm, setConfirm] = useState("");
  const [del, setDel] = useState(false);
  const [note, setNote] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    // no-store on all: these GETs were heuristic-cached and re-served stale after mutations
    const [p, s, g] = await Promise.all([
      fetch("/api/settings/profile", { cache: "no-store" }).then((x) => x.json()).catch(() => null),
      fetch("/api/settings/sessions", { cache: "no-store" }).then((x) => x.json()).catch(() => null),
      fetch("/api/instagram/connect", { cache: "no-store" }).then((x) => x.json()).catch(() => null),
    ]);
    if (p?.ok) { setProfile(p.profile); setAbout(p.profile?.about ?? ""); }
    setSessions(s?.ok ? s.sessions ?? [] : []);
    if (g?.ok) setIg({ live: g.live, account: g.account });
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("ig");
    if (q === "connected") setNote({ kind: "ok", text: "Instagram connected — DMs and comments will show up in your inbox" });
    if (q && q.startsWith("err")) setNote({ kind: "bad", text: q === "err-noappid" ? "Instagram isn't configured on this server yet." : "Instagram connection failed — try again." });
    const h = window.location.hash.slice(1); if (h) requestAnimationFrame(() => document.getElementById(h)?.scrollIntoView());
  }, []);
  useEffect(() => { if (note) { const t = setTimeout(() => setNote(null), 4000); return () => clearTimeout(t); } }, [note]);
  // scroll-spy on the shell's scrolling content area
  useEffect(() => {
    const sc = root.current?.closest("main.content"); if (!sc) return;
    const on = () => { let cur = SECTIONS[0][1]; for (const [, id] of SECTIONS) { const el = document.getElementById(id); if (el && el.getBoundingClientRect().top < 220) cur = id; } setActive(cur); };
    sc.addEventListener("scroll", on, { passive: true }); return () => sc.removeEventListener("scroll", on);
  }, []);

  async function saveAbout() {
    setBusy(true);
    const d = await fetch("/api/settings/profile", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ about: about.trim() || null }) }).then((x) => x.json()).catch(() => null);
    setBusy(false); setNote(d?.ok ? { kind: "ok", text: "Profile saved" } : { kind: "bad", text: d?.error ?? "Couldn't save" }); if (d?.ok) await load();
  }
  const [allSess, setAllSess] = useState(false);
  const [notif, setNotif] = useState<{ digest: boolean; emailOn: boolean } | null>(null);
  useEffect(() => { fetch("/api/settings/notifications", { cache: "no-store" }).then((r) => r.json()).then((d) => d?.ok && setNotif({ digest: d.digest, emailOn: d.emailOn })).catch(() => {}); }, []);
  async function setDigest(v: boolean) {
    setNotif((n) => n && { ...n, digest: v });
    const d = await fetch("/api/settings/notifications", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ digest: v }) }).then((x) => x.json()).catch(() => null);
    setNote(d?.ok ? { kind: "ok", text: v ? "Morning summary on" : "Morning summary off" } : { kind: "bad", text: "Couldn't save — try again" });
  }
  async function revokeOthers() {
    const d = await fetch("/api/settings/sessions", { method: "DELETE" }).then((x) => x.json()).catch(() => null);
    setNote(d?.ok ? { kind: "ok", text: `Signed out ${d.removed} other session${d.removed === 1 ? "" : "s"}` } : { kind: "bad", text: d?.error ?? "Couldn't sign them out — try again" }); await load();
  }
  async function revoke(id: string) {
    const d = await fetch(`/api/settings/sessions/${id}`, { method: "DELETE" }).then((x) => x.json()).catch(() => null);
    setNote(d?.ok ? { kind: "ok", text: "Session revoked — that device is signed out" } : { kind: "bad", text: d?.error ?? "Couldn't sign it out — try again" }); await load();
  }
  async function deleteWorkspace() {
    setBusy(true);
    const d = await fetch("/api/settings/delete-workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmName: confirm }) }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (d?.ok) window.location.href = "/"; else setNote({ kind: "bad", text: d?.error ?? "Deletion failed — the name didn't match." });
  }

  const conn = profile?.connection;
  const connected = conn?.status === "connected";
  const number = conn?.display_name?.match(/\(([^)]+)\)/)?.[1];
  const bizName = conn?.display_name?.replace(/\s*\(.*\)\s*$/, "") || "Your business";
  let lastGroup = "";

  return (
    <div className="pg-settings" ref={root} data-testid="settings">
      <div className="sw">
        <nav className="card snav" aria-label="Settings sections">
          {SECTIONS.map(([g, id, label, icon]) => {
            const head = g !== lastGroup; lastGroup = g;
            return (
              <span key={id} style={{ display: "contents" }}>
                {head && <span className="grp eyebrow">{g}</span>}
                <a className={`si${active === id ? " on" : ""}`} href={`#${id}`} onClick={(e) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: "smooth" }); setActive(id); history.replaceState(null, "", `#${id}`); }}><Icon name={icon} />{label}</a>
              </span>
            );
          })}
        </nav>
        <div className="secs">
          <section className="card sec" id="profile">
            <div className="card-h"><span className="grow"><span className="h2">Business profile</span><small>How your business appears inside NextBiz One.</small></span>
              <button className="btn btn-primary btn-sm" disabled={busy || about === (profile?.about ?? "")} onClick={() => void saveAbout()}>Save</button></div>
            <div className="frow"><div><b>Business name</b><small>What customers see in WhatsApp. Managed by Meta.</small></div>
              <div className="col gap-6"><div className="locked"><Icon name="lock" size="sm" />{bizName}<span className="sp" />{connected && <span className="pill ok sm">Verified</span>}</div><span className="hint">Change it in WhatsApp Manager — Meta reviews display-name changes.</span></div></div>
            <div className="frow"><div><b>About</b><small>A one-liner about what you do</small></div><textarea className="textarea" rows={2} maxLength={500} value={about} onChange={(e) => setAbout(e.target.value)} placeholder="Websites, ads and WhatsApp for small businesses in Kolkata." aria-label="About your business" /></div>
            <div className="frow"><div><b>Login email</b><small>For alerts and login</small></div><div className="locked">{email || "—"}</div></div>
            <div className="frow"><div><b>Your name</b></div><div className="locked">{displayName}</div></div>
          </section>

          <section className="card sec" id="whatsapp">
            <div className="card-h"><span className="grow"><span className="h2">WhatsApp</span><small>Your connected business number.</small></span></div>
            <div className="wa-card">
              <div className="wa-top"><span className="logo"><Icon name="whatsapp-logo" /></span>
                <span className="grow"><b>{bizName}</b><small>{number ? `+${number}`.replace("++", "+") : "No number connected"}</small></span>
                <span className={`pill ${connected ? "ok" : "warn"}`}>{connected ? "Connected" : conn?.status ?? "Not connected"}</span></div>
              <div className="wa-grid">
                <div><span>Status</span><b>{connected ? "Live" : "Offline"}</b><small>{connected ? "Sending and receiving" : "Messages can't arrive"}</small></div>
                <div><span>Reply window</span><b>24 hours</b><small>Free-form after each customer message</small></div>
                <div><span>Broadcasts</span><b>Opt-in only</b><small>Enforced for every send</small></div>
                <div><span>Templates</span><b>Meta-reviewed</b><small>Needed outside the window</small></div>
              </div>
            </div>
            {!connected && <div className="frow"><div><b>Connect your number</b><small>Takes about 3 minutes with Facebook login</small></div><div><a className="btn btn-primary btn-sm" href="/connections#whatsapp"><Icon name="plugs-connected" />Connect WhatsApp</a></div></div>}
            <div className="frow"><div><b>Change number</b><small>A number can serve one workspace</small></div><div className="xs muted" style={{ fontWeight: 600, alignSelf: "center" }}>Contact support to move to a different number.</div></div>
          </section>

          <section className="card sec" id="channels">
            <div className="card-h"><span className="grow"><span className="h2">Other channels</span><small>More ways to reach customers — rolling out during early access.</small></span><a className="btn btn-soft btn-sm" href="/connections"><Icon name="plugs-connected" />All connections</a></div>
            <div className="chan">
              <div className="ch" data-testid="ig-acct" style={ig?.account ? { borderStyle: "solid", background: "var(--surface)" } : undefined}>
                <span className="icon-tile pink lg"><Icon name="instagram-logo" /></span>
                <span className="grow"><b>Instagram DMs &amp; comments{ig?.account?.username ? ` · @${ig.account.username.replace(/^@/, "")}` : ""}</b>
                  <small>{ig?.account ? (ig.account.live ? `Connected · token valid until ${ig.account.expires_at ? d8(ig.account.expires_at) : "—"}` : "Connecting… (test mode)") : "Reply to Instagram DMs and comments from NextBiz One"}</small></span>
                <span className={`st pill sm ${ig?.account?.live ? "ok" : ig?.account ? "warn" : "neutral"}`}>{ig?.account?.live ? "Connected" : ig?.account ? "Pending" : "Not connected"}</span>
              </div>
              <div className="ch"><span className="icon-tile orange lg"><Icon name="megaphone" /></span><span className="grow"><b>Meta ad account</b><small>Run click-to-WhatsApp ads</small></span><span className="demo">Demo</span></div>
            </div>
            {ig?.account?.live && (
              <div className="frow"><div><b>Instagram status</b><small>Messages and comments reach NextBiz One through Meta webhooks</small></div>
                <div className="col gap-6">
                  <span className={`pill sm ${ig.account.webhook_subscribed ? "ok" : "warn"}`} style={{ alignSelf: "flex-start" }} data-testid="ig-webhook">{ig.account.webhook_subscribed ? "Receiving messages & comments" : "Not receiving events yet"}</span>
                  {ig.account.last_error && <span className="hint err">{ig.account.last_error}</span>}
                </div></div>
            )}
            <div className="frow" data-testid="ig-connect-strip"><div><b>{ig?.account?.live ? "Reconnect Instagram" : "Connect Instagram"}</b><small>Log in with the Instagram professional account you want to automate</small></div>
              <div className="row wrap gap-6">
                <button className="btn btn-soft btn-sm" data-testid="ig-oauth" onClick={() => { window.location.href = "/api/auth/instagram/start"; }}><Icon name="instagram-logo" />{ig?.account?.live ? "Reconnect" : "Login with Instagram"}</button>
                {ig?.account && <button className="btn btn-ghost btn-sm" data-testid="ig-disconnect" onClick={async () => { await fetch("/api/instagram/connect", { method: "DELETE" }); setNote({ kind: "ok", text: "Instagram disconnected" }); await load(); }}>Disconnect</button>}
              </div></div>
          </section>

          <section className="card sec" id="notifications">
            <div className="card-h"><span className="grow"><span className="h2">Email</span><small>Sent to {email}</small></span></div>
            <div className="frow"><div><b>Morning summary</b><small>One email around 9 am when customers have been waiting for a reply. Nothing on quiet days.</small></div>
              <div><button className={`tog${notif?.digest ? " on" : ""}`} role="switch" aria-checked={!!notif?.digest} aria-label="Morning summary email" disabled={!notif} onClick={() => notif && void setDigest(!notif.digest)} data-testid="digest-toggle" /></div></div>
            <div className="frow" style={{ borderBottom: 0 }}><div><b>Account emails</b><small>Password resets and important notices about your workspace. These are always on.</small></div><div><span className="pill sm neutral nodot">Always on</span></div></div>
            {notif && !notif.emailOn && <p className="xs faint" style={{ padding: "0 var(--pad) var(--pad)", fontWeight: 600 }}>Email sending is being set up — your choice is saved and applies as soon as it&apos;s live.</p>}
          </section>

          <section className="card sec" id="security">
            <div className="card-h"><span className="grow"><span className="h2">Login &amp; security</span><small>{email}</small></span></div>
            <div className="frow" style={{ borderBottom: 0 }}><div><b>Active sessions</b><small>{sessions ? `${sessions.length} signed in · each expires 30 days after sign-in` : "Devices signed in to your account"}</small></div>
              <div>{(sessions?.length ?? 0) > 1 && <button className="btn btn-soft btn-sm" onClick={() => void revokeOthers()} data-testid="revoke-others"><Icon name="sign-out" />Sign out all others</button>}</div></div>
            <div className="sess compact">
              {sessions === null && <span className="sk" style={{ height: 40 }} />}
              {(sessions ?? []).slice(0, allSess ? undefined : 5).map((s) => { const [dev, ic] = device(s.user_agent); return (
                <div className={`se2${s.current ? " cur" : ""}`} key={s.id} data-testid="session-row">
                  <Icon name={ic} />
                  <span className="grow trunc"><b>{s.current ? `This device · ${dev}` : dev}</b><small>Signed in {rel(s.created_at)}</small></span>
                  {s.current ? <span className="pill ok sm">Current</span> : <button className="btn btn-ghost btn-sm" onClick={() => void revoke(s.id)} aria-label={`Sign out ${dev}`}>Sign out</button>}
                </div>); })}
              {(sessions?.length ?? 0) > 5 && <button className="se-more" onClick={() => setAllSess((v) => !v)} data-testid="sessions-more">{allSess ? "Show fewer" : `Show ${sessions!.length - 5} more`}<Icon name={allSess ? "caret-up" : "caret-down"} size="sm" /></button>}
            </div>
          </section>

          <section className="card sec danger" id="data">
            <div className="card-h"><span className="grow"><span className="h2">Your data</span><small>It&apos;s yours — take it with you any time.</small></span></div>
            {([["contacts", "Contacts", "Names, numbers, tags and opt-in status"], ["conversations", "Conversations", "Every message, in and out"], ["broadcasts", "Broadcast reports", "Per-recipient delivery results"]] as const).map(([ds, l, s]) => (
              <div className="frow" key={ds}><div><b>{l}</b><small>{s}</small></div><div><a className="btn btn-soft btn-sm" href={`/api/settings/export?dataset=${ds}`}><Icon name="download-simple" />Export CSV</a></div></div>
            ))}
            <div className="frow danger-zone"><div><b style={{ color: "var(--danger-deep)" }}>Delete workspace</b><small>Removes all contacts, conversations, templates and broadcasts. Cannot be undone.</small></div>
              <div className="col gap-6">
                {!del ? <div><button className="btn btn-danger btn-sm" onClick={() => setDel(true)}><Icon name="trash" />Delete workspace…</button></div> : (
                  <>
                    <label className="label" htmlFor="del-confirm">Type <b style={{ color: "var(--ink)" }}>{profile?.name}</b> to confirm</label>
                    <input id="del-confirm" className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
                    <div className="row"><button className="btn btn-ghost btn-sm" onClick={() => { setDel(false); setConfirm(""); }}>Cancel</button><button className="btn btn-danger btn-sm" disabled={busy || confirm !== profile?.name} onClick={() => void deleteWorkspace()}>Delete forever</button></div>
                  </>
                )}
              </div></div>
          </section>
        </div>
      </div>
      {note && <div role="status" style={{ position: "fixed", bottom: 90, left: "50%", transform: "translateX(-50%)", background: "var(--surface)", border: `1px solid ${note.kind === "ok" ? "var(--chat-line)" : "var(--danger-line)"}`, color: note.kind === "ok" ? "var(--chat-deep)" : "var(--danger-deep)", boxShadow: "var(--shadow-2)", borderRadius: 999, padding: "9px 16px", fontSize: 12, fontWeight: 700, zIndex: 95 }}>{note.text}</div>}
    </div>
  );
}
