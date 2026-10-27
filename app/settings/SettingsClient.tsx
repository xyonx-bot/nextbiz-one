"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Settings — ported 1:1 from settings/wireframe.html: snav (208px, grouped)
 * + scontent stack. Display phone comes FROM the connection (read-only).
 * Locked out: billing, team, operator, analytics. Word "WABA" never appears.
 */
type Profile = { name: string; about: string | null; connection: { display_name: string | null; status: string | null } | null };
type Session = { id: string; created_at: string; expires_at: string; current: boolean };

const IC = "https://cdn.joyverse.fun/mira-assets/phosphor/bold/";
const SECTIONS = [
  { group: "Workspace", id: "profile", label: "Profile" },
  { group: "Workspace", id: "connections", label: "Connections" },
  { group: "Account", id: "security", label: "Security" },
  { group: "Account", id: "data", label: "Data" },
] as const;

export function SettingsClient({ email }: { email: string }) {
  const [sec, setSec] = useState<string>("profile");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    // no-store on both: these GETs were heuristic-cached and re-served stale
    // after mutations (revoke updated the DB, the list didn't move)
    const [p, s] = await Promise.all([
      fetch("/api/settings/profile", { cache: "no-store" }).then((x) => x.json()).catch(() => null),
      fetch("/api/settings/sessions", { cache: "no-store" }).then((x) => x.json()).catch(() => null),
    ]);
    if (p?.ok) setProfile(p.profile);
    if (s?.ok) setSessions(s.sessions ?? []);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function saveProfile(patch: Record<string, unknown>) {
    const d = await fetch("/api/settings/profile", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
    }).then((x) => x.json()).catch(() => null);
    setNote(d?.ok ? "Saved ✓" : (d?.error ?? "Save failed"));
    if (d?.ok) await load();
  }

  async function revokeSession(id: string) {
    setNote("Revoking…");
    const d = await fetch(`/api/settings/sessions/${id}`, { method: "DELETE" })
      .then((x) => x.json()).catch(() => null);
    setNote(d?.ok ? "Session revoked ✓" : (d?.error ?? "Revoke failed — try again"));
    await load();
  }

  const conn = profile?.connection;
  const groups: string[] = [];
  return (
    <div className="szone" data-testid="settings">
      <nav className="snav" aria-label="Settings sections">
        {SECTIONS.map((s) => {
          const showGroup = !groups.includes(s.group) && (groups.push(s.group), true);
          return (
            <span key={s.id}>
              {showGroup && <span className="sgroup">{s.group}</span>}
              <div className={`si${sec === s.id ? " on" : ""}`} onClick={() => setSec(s.id)}>
                <img src={`${IC}${({ profile: "identification-card-bold", connections: "plugs-connected-bold", security: "lock-bold", data: "database-bold" } as Record<string, string>)[s.id]}.svg`} alt="" />
                <span>{s.label}</span>
              </div>
            </span>
          );
        })}
      </nav>

      <div className="scontent">
        {sec === "profile" && (
          <section className="scard" aria-label="Workspace profile">
            <h2>Workspace profile</h2>
            <div className="desc">Shown to your customers on WhatsApp and in message previews.</div>
            <div className="frow"><span className="fl">Business name</span>
              <span className="fin" onClick={() => { const v = prompt("Business name:", profile?.name ?? ""); if (v && v !== profile?.name) void saveProfile({ businessName: v }); }} style={{ cursor: "pointer" }}>
                {profile?.name ?? "—"} <small style={{ color: "var(--ink-3)" }}>edit</small></span></div>
            <div className="frow"><span className="fl">Display phone <small>the number customers reply to</small></span>
              <span className="fval"><img src={`${IC}phone-bold.svg`} alt="" style={{ width: 12, height: 12 }} /> {conn?.display_name ?? "—"} · {conn?.status === "connected" ? "connected" : (conn?.status ?? "not connected")}</span></div>
            <div className="frow"><span className="fl">About</span>
              <span className="fin" onClick={() => { const v = prompt("About your business:", profile?.about ?? ""); if (v !== null) void saveProfile({ about: v }); }} style={{ cursor: "pointer" }}>
                {(profile?.about || "Add a one-liner about your business…")} <small style={{ color: "var(--ink-3)" }}>edit</small></span></div>
            <div className="frow"><span className="fl">Email <small>for alerts and login</small></span>
              <span className="fin hint">{email}</span></div>
          </section>
        )}

        {sec === "connections" && (
          <section className="scard" aria-label="Connections">
            <h2>Connections</h2>
            <div className="acct">
              <span className="aic wa">W</span>
              <div className="t"><b>{profile?.name ?? "Workspace"} WhatsApp · {conn?.display_name ?? "—"}</b>
                <span>Connected · status: {conn?.status ?? "not connected"}</span></div>
              <span className={`st ${conn?.status === "connected" ? "ok" : "pend"}`}>{conn?.status === "connected" ? "Connected" : "Pending"}</span>
            </div>
            <div className="connect-strip">
              <span><b>Adding another number?</b> Connect flow: verify number → set display name → start messaging. A number can only serve one workspace.</span>
            </div>
          </section>
        )}

        {sec === "security" && (
          <section className="scard" aria-label="Security">
            <h2>Security</h2>
            <div className="secrow"><span className="ic"><img src={`${IC}lock-bold.svg`} alt="" /></span>
              <div className="t"><b>Two-factor authentication</b><span>Not configured yet — password + session expiry are active meanwhile</span></div></div>
            <div className="secrow"><span className="ic"><img src={`${IC}devices-bold.svg`} alt="" /></span>
              <div className="t"><b>Active sessions</b><span>{sessions.length} active session{sessions.length === 1 ? "" : "s"}</span></div></div>
            {sessions.map((s) => (
              <div className="frow" key={s.id}>
                <span className="fl">{s.current ? "This device" : "Other session"} <small>since {new Date(s.created_at).toLocaleDateString()}</small></span>
                <span className="fval">{s.current ? "current" : "active"} · expires {new Date(s.expires_at).toLocaleDateString()}
                  {!s.current && <button className="btn btn-soft" style={{ minHeight: 22, padding: "0 8px", fontSize: 9, marginLeft: 8 }}
                    onClick={() => void revokeSession(s.id)}>Revoke</button>}</span>
              </div>
            ))}
          </section>
        )}

        {sec === "data" && (
          <section className="scard" aria-label="Data">
            <h2>Data</h2>
            <div className="desc">Export what you own. Templates stay in the app (Meta-owned content).</div>
            {[
              ["contacts", "Contacts"], ["conversations", "Conversations history"], ["broadcasts", "Broadcast reports"],
            ].map(([ds, label]) => (
              <div className="frow" key={ds}><span className="fl">{label}</span>
                <span className="fval"><a className="btn btn-soft" style={{ minHeight: 24, padding: "0 9px", fontSize: 10, textDecoration: "none" }}
                  href={`/api/settings/export?dataset=${ds}`}><img src={`${IC}download-simple-bold.svg`} alt="" style={{ width: 11, height: 11 }} />Export CSV</a></span></div>
            ))}
            <div className="danger-zone" style={{ marginTop: 16 }}>
              <b>Delete workspace</b>
              <span>Removes all contacts, conversations, templates and broadcasts. Your WhatsApp number is released after 48 hours (Meta-side). Cannot be undone.</span>
              <button className="btn btn-soft" style={{ color: "var(--danger)", border: "1px solid var(--danger)", minHeight: 26, fontSize: 10 }}
                      onClick={() => {
                        const name = prompt(`Type the workspace name "${profile?.name}" to confirm deletion:`);
                        if (!name) return;
                        void fetch("/api/settings/delete-workspace", { method: "POST", headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ confirmName: name }) })
                          .then((x) => x.json()).then((d) => {
                            if (d?.ok) window.location.href = "/";
                            else alert(d?.error ?? "Deletion failed — name didn't match.");
                          });
                      }}>Delete workspace</button>
            </div>
          </section>
        )}
      </div>
      {note && <div style={{ position: "fixed", bottom: 18, left: "50%", transform: "translateX(-50%)", background: "var(--card)", border: "1px solid var(--line)", borderRadius: 999, padding: "7px 14px", fontSize: 11, zIndex: 60 }}>{note}</div>}
    </div>
  );
}
