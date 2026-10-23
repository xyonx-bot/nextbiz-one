import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { Shell } from "@/components/Shell";

export const dynamic = "force-dynamic";

/**
 * P1.5 Dashboard — ported 1:1 from Mira's dashboard wireframe (leaf page,
 * panel hidden): date-range chips, clay stat cards with sparklines (CSS
 * placeholders per HANDOFF §5), activity chart (CSS placeholder build-note),
 * recent conversations, quick actions. LIVE counts from the real WABA.
 */
export default async function HomePage() {
  const token = (await cookies()).get("nbo_session")?.value;
  const user = await getSessionUser(token);
  const initials = (user?.displayName ?? "NBO").split(/\s+/).map((s) => s[0]).join("").slice(0, 2).toUpperCase();
  const p = getPool();

  const [today, active, newContacts, unread, recents, conn] = await Promise.all([
    p.query(`SELECT count(*)::int AS n FROM messages WHERE created_at > now() - interval '1 day'`),
    p.query(`SELECT count(*)::int AS n FROM conversations WHERE last_inbound_at > now() - interval '24 hours'`),
    p.query(`SELECT count(*)::int AS n FROM contacts WHERE created_at > now() - interval '30 days'`),
    p.query(`SELECT count(*)::int AS n FROM messages m JOIN conversations c ON c.id = m.conversation_id
              WHERE m.direction = 'in' AND m.created_at > COALESCE(c.last_read_at, to_timestamp(0))`),
    p.query(`SELECT ct.name, ct.wa_id, m.body, m.created_at, m.direction
               FROM messages m
               JOIN conversations c ON c.id = m.conversation_id
               JOIN contacts ct ON ct.id = c.contact_id
              ORDER BY m.created_at DESC LIMIT 5`),
    p.query(`SELECT status FROM waba_connections LIMIT 1`),
  ]);

  const connStatus = conn.rows[0]?.status ?? "disconnected";
  const connected = connStatus === "connected";
  const fmt = (d: Date) => new Date(d).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

  return (
    <Shell active="dashboard" userInitials={initials} userName={user?.displayName ?? "Operator"} unread={unread.rows[0].n}>
      <div className="content" data-testid="dashboard">
        <div className="drange">
          <span className="chip">7 days</span>
          <span className="chip on">30 days</span>
          <span className="chip">Custom…</span>
          <span className="spacer" />
          <span style={{ fontSize: "10px", color: "var(--ink-3)" }}>Live — real WhatsApp data</span>
        </div>

        <div className="stats">
          <div className="stat">
            <div className="k"><img src="https://cdn.joyverse.fun/mira-assets/phosphor/bold/chat-circle-dots-bold.svg" alt="" />Messages (24h)</div>
            <div className="v">{today.rows[0].n}</div>
            <div className="d"><img src="https://cdn.joyverse.fun/mira-assets/phosphor/bold/trend-up-bold.svg" alt="" />Live count</div>
          </div>
          <div className="stat">
            <div className="k"><img src="https://cdn.joyverse.fun/mira-assets/phosphor/bold/chat-circle-dots-bold.svg" alt="" />Active conversations</div>
            <div className="v">{active.rows[0].n}</div>
            <div className="d"><img src="https://cdn.joyverse.fun/mira-assets/phosphor/bold/trend-up-bold.svg" alt="" />Inside the 24h window</div>
          </div>
          <div className="stat">
            <div className="k"><img src="https://cdn.joyverse.fun/mira-assets/phosphor/bold/users-bold.svg" alt="" />New contacts (30d)</div>
            <div className="v">{newContacts.rows[0].n}</div>
            <div className="d"><img src="https://cdn.joyverse.fun/mira-assets/phosphor/bold/trend-up-bold.svg" alt="" />Auto-created from WhatsApp</div>
          </div>
        </div>

        <div className="mid">
          <div className="panel">
            <div className="phead"><b>WhatsApp activity</b><div className="r" /></div>
            <div className="chart-zone">
              <div className="legend">
                <span><i style={{ background: "var(--chat)" }} />Inbound</span>
                <span><i style={{ background: "var(--chat-tint)", border: "1px solid #DCEFBB" }} />Outbound</span>
              </div>
              <div className="chart">
                <div className="spec"><b>Build note:</b> thin bar pairs 4px, pair-gap 3px · apple-green inbound / tint+hairline outbound · hover tooltip 12px/600 · no gradients.</div>
                <div className="gl" style={{ bottom: "25%" }}><span>25</span></div>
                <div className="gl" style={{ bottom: "50%" }}><span>50</span></div>
                <div className="gl" style={{ bottom: "75%" }}><span>75</span></div>
              </div>
            </div>
          </div>
          <div className="panel">
            <div className="phead"><b>Connection</b><div className="r" /></div>
            <div style={{ padding: "16px", display: "grid", gap: "10px" }}>
              <span className={`chip ${connected ? "chip-tag" : "chip-warn"}`}>
                {connected ? "WhatsApp connected" : "Not connected"}
              </span>
              <span style={{ fontSize: "11px", color: "var(--ink-2)" }}>
                {connected
                  ? "Webhook live — inbound messages and delivery states flow in."
                  : "Connect WhatsApp from Settings when the wizard ships (S3)."}
              </span>
              <div className="qa-wrap">
                <button className="qa-btn" data-testid="qa-btn">
                  <img src="https://cdn.joyverse.fun/mira-assets/phosphor/bold/megaphone-bold.svg" alt="" />
                  <span className="lbl">Quick actions</span>
                  <span className="qa-sep" />
                  <span className="qa-chev"><img src="https://cdn.joyverse.fun/mira-assets/phosphor/bold/caret-down-bold.svg" alt="" /></span>
                </button>
                <div className="qa-menu">
                  <a href="/inbox" style={{ display: "contents" }}><div className="qa-tile"><img src="https://cdn.joyverse.fun/mira-assets/phosphor/bold/tray-bold.svg" alt="" style={{ color: "var(--chat-deep)", background: "var(--chat-tint)" }} /><b>Open Inbox</b><span className="qa-k">Reply to conversations</span></div></a>
                  <a href="/contacts" style={{ display: "contents" }}><div className="qa-tile"><img src="https://cdn.joyverse.fun/mira-assets/phosphor/bold/users-bold.svg" alt="" style={{ color: "var(--info)", background: "var(--info-tint)" }} /><b>Contacts</b><span className="qa-k">Browse the book</span></div></a>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="phead"><b>Recent conversations</b><div className="r"><a className="lnk" href="/inbox">Open inbox</a></div></div>
          <div className="krows" style={{ padding: "6px 8px" }}>
            {recents.rows.length === 0 && (
              <div style={{ padding: "14px", color: "var(--ink-3)", fontSize: "11px" }}>No messages yet.</div>
            )}
            {recents.rows.map((r, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 6px", borderBottom: "1px solid var(--line)", fontSize: "11.5px" }}>
                <b style={{ minWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name ?? "+" + r.wa_id}</b>
                <span style={{ color: "var(--ink-2)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.direction === "in" ? "← " : "→ "}{r.body}</span>
                <span style={{ color: "var(--ink-3)", fontSize: "10px" }}>{fmt(r.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Shell>
  );
}
