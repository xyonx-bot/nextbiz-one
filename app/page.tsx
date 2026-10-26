import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { Shell } from "@/components/Shell";

export const dynamic = "force-dynamic";

/**
 * P1.5 Dashboard — ported 1:1 from Mira's dashboard wireframe (leaf page,
 * panel hidden): date-range chips, 4 clay stat cards with sparklines +
 * trend deltas, WhatsApp activity chart (CSS bar pairs + gridlines per the
 * wireframe build-note), connection health rows, quick actions, recent
 * conversations. LIVE counts from the real WABA.
 */

function spark(series: number[]) {
  const max = Math.max(...series, 1);
  return (
    <div className="spark">
      {series.map((n, i) => (
        <i key={i} className={i === series.length - 1 ? "hi" : ""}
           style={{ height: n > 0 ? `${Math.max(6, Math.round((n / max) * 100))}%` : "3px" }} />
      ))}
    </div>
  );
}

function trend(cur: number, prev: number) {
  if (prev === 0) {
    if (cur === 0) return <div className="d">No activity yet</div>;
    return <div className="d"><img src="https://cdn.joyverse.fun/mira-assets/phosphor/bold/trend-up-bold.svg" alt="" />First activity in the last 14d</div>;
  }
  const pct = Math.round(((cur - prev) / prev) * 100);
  const up = pct >= 0;
  return (
    <div className="d">
      <img src={`https://cdn.joyverse.fun/mira-assets/phosphor/bold/trend-${up ? "up" : "down"}-bold.svg`} alt="" />
      {up ? "+" : ""}{pct}% vs prior 14d
    </div>
  );
}

function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function dayLabel(d: Date) {
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export default async function HomePage() {
  const token = (await cookies()).get("nbo_session")?.value;
  const user = await getSessionUser(token);
  const initials = (user?.displayName ?? "NBO").split(/\s+/).map((s) => s[0]).join("").slice(0, 2).toUpperCase();
  const p = getPool();

  const [today, active, newContacts, unread, deliveries, msgs14, msgTrend, conv14, contacts14, deliv14, recents, conn] =
    await Promise.all([
      p.query(`SELECT count(*)::int AS n FROM messages WHERE created_at > now() - interval '1 day'`),
      p.query(`SELECT count(*)::int AS n FROM conversations WHERE last_inbound_at > now() - interval '24 hours'`),
      p.query(`SELECT count(*)::int AS n FROM contacts WHERE created_at > now() - interval '30 days'`),
      p.query(`SELECT count(*)::int AS n FROM messages m JOIN conversations c ON c.id = m.conversation_id
                WHERE m.direction = 'in' AND m.created_at > COALESCE(c.last_read_at, to_timestamp(0))`),
      p.query(`SELECT count(*)::int AS n FROM broadcast_recipients br
                WHERE br.status IN ('delivered','read')`),
      p.query(`SELECT date_trunc('day', created_at)::date AS d, direction, count(*)::int AS n
                 FROM messages WHERE created_at > now() - interval '14 days' GROUP BY 1,2`),
      p.query(`SELECT
                 (SELECT count(*)::int FROM messages WHERE created_at > now() - interval '14 days') AS cur,
                 (SELECT count(*)::int FROM messages WHERE created_at > now() - interval '28 days'
                    AND created_at <= now() - interval '14 days') AS prev`),
      p.query(`SELECT date_trunc('day', m.created_at)::date AS d, count(DISTINCT m.conversation_id)::int AS n
                 FROM messages m WHERE m.created_at > now() - interval '14 days' GROUP BY 1`),
      p.query(`SELECT date_trunc('day', created_at)::date AS d, count(*)::int AS n
                 FROM contacts WHERE created_at > now() - interval '14 days' GROUP BY 1`),
      p.query(`SELECT date_trunc('day', br.sent_at)::date AS d, count(*)::int AS n
                 FROM broadcast_recipients br
                WHERE br.sent_at > now() - interval '14 days' AND br.status IN ('delivered','read','sent')
                GROUP BY 1`),
      p.query(`SELECT ct.name, ct.wa_id, m.body, m.created_at, m.direction
                 FROM messages m
                 JOIN conversations c ON c.id = m.conversation_id
                 JOIN contacts ct ON ct.id = c.contact_id
                ORDER BY m.created_at DESC LIMIT 5`),
      p.query(`SELECT status, display_name FROM waba_connections LIMIT 1`),
    ]);

  const connStatus = conn.rows[0]?.status ?? "disconnected";
  const connected = connStatus === "connected";
  const connName = conn.rows[0]?.display_name ?? "WhatsApp Business Account";
  const fmt = (d: Date) => new Date(d).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

  // ── 14-day series builders ──
  const days: string[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(dayKey(d));
  }
  const pick = (rows: { d: string; n: number }[]) => {
    const keyOf = (d: unknown) =>
      d instanceof Date
        ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
        : String(d).slice(0, 10);
    const m = new Map(rows.map((r) => [keyOf(r.d), r.n]));
    return days.map((dk) => m.get(dk) ?? 0);
  };
  const inRows = msgs14.rows.filter((r) => r.direction === "in").map((r) => ({ d: r.d, n: r.n }));
  const outRows = msgs14.rows.filter((r) => r.direction === "out").map((r) => ({ d: r.d, n: r.n }));
  const inSeries = pick(inRows);
  const outSeries = pick(outRows);
  const convSeries = pick(conv14.rows.map((r) => ({ d: r.d, n: r.n })));
  const contactSeries = pick(contacts14.rows.map((r) => ({ d: r.d, n: r.n })));
  const delivSeries = pick(deliv14.rows.map((r) => ({ d: r.d, n: r.n })));

  // ── chart: bar pairs per day, gridlines at 25/50/75% of max ──
  const maxAll = Math.max(...inSeries.map((v, i) => v + outSeries[i]), 1);
  const gridVal = (pct: number) => (maxAll > 0 ? Math.round((maxAll * pct) / 5) * 5 : 0);

  return (
    <Shell active="dashboard" userInitials={initials} userName={user?.displayName ?? "Operator"} unread={unread.rows[0].n}>
      <div className="content" data-testid="dashboard">
        <div className="drange">
          <span className="chip">7 days</span>
          <span className="chip on">14 days</span>
          <span className="chip">Custom…</span>
          <span className="spacer" />
          <span style={{ fontSize: "10px", color: "var(--ink-3)" }}>Live — real WhatsApp data</span>
        </div>

        <div className="stats">
          <div className="stat">
            <div className="k"><img src="https://cdn.joyverse.fun/mira-assets/phosphor/bold/chat-circle-dots-bold.svg" alt="" />Messages (24h)</div>
            <div className="v">{today.rows[0].n}</div>
            {trend(msgTrend.rows[0].cur, msgTrend.rows[0].prev)}
            {spark(inSeries)}
          </div>
          <div className="stat">
            <div className="k"><img src="https://cdn.joyverse.fun/mira-assets/phosphor/bold/chats-circle-bold.svg" alt="" />Active conversations</div>
            <div className="v">{active.rows[0].n}</div>
            <div className="d"><img src="https://cdn.joyverse.fun/mira-assets/phosphor/bold/trend-up-bold.svg" alt="" />Inside the 24h window</div>
            {spark(convSeries)}
          </div>
          <div className="stat">
            <div className="k"><img src="https://cdn.joyverse.fun/mira-assets/phosphor/bold/users-bold.svg" alt="" />New contacts (30d)</div>
            <div className="v">{newContacts.rows[0].n}</div>
            <div className="d"><img src="https://cdn.joyverse.fun/mira-assets/phosphor/bold/trend-up-bold.svg" alt="" />Auto-created from WhatsApp</div>
            {spark(contactSeries)}
          </div>
          <div className="stat">
            <div className="k"><img src="https://cdn.joyverse.fun/mira-assets/phosphor/bold/megaphone-bold.svg" alt="" />Broadcast deliveries</div>
            <div className="v">{deliveries.rows[0].n}</div>
            <div className="d"><img src="https://cdn.joyverse.fun/mira-assets/phosphor/bold/trend-up-bold.svg" alt="" />Delivered + read</div>
            {spark(delivSeries)}
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
              <div className="chart" data-testid="chart">
                {maxAll > 0 && [0.25, 0.5, 0.75].map((f) => (
                  <div key={f} className="gl" style={{ bottom: `${f * 100}%` }}><span>{gridVal(f)}</span></div>
                ))}
                {days.map((dk, i) => (
                  <div key={dk} className="wk" title={`${dayLabel(new Date(new Date().setDate(new Date().getDate() - (13 - i))))}: ${inSeries[i]} in · ${outSeries[i]} out`}>
                    <div className="pair">
                      <span className="in" style={{ height: inSeries[i] > 0 ? `${Math.max(3, Math.round((inSeries[i] / maxAll) * 100))}%` : "2px" }} />
                      <span className="out" style={{ height: outSeries[i] > 0 ? `${Math.max(3, Math.round((outSeries[i] / maxAll) * 100))}%` : "2px" }} />
                    </div>
                  </div>
                ))}
                <div className="xlab">
                  <span>{dayLabel(new Date(new Date().setDate(new Date().getDate() - 13)))}</span>
                  <span>{dayLabel(new Date(new Date().setDate(new Date().getDate() - 6)))}</span>
                  <span>{dayLabel(new Date())}</span>
                </div>
                {maxAll === 0 && <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "var(--ink-3)", fontSize: "11px" }}>No messages yet — activity shows up here.</div>}
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="phead"><b>Connection health</b><div className="r"><a className="lnk" href="/settings">Settings →</a></div></div>
            <div className="hrow">
              <div className="ic"><img src="https://cdn.joyverse.fun/mira-assets/phosphor/bold/plugs-connected-bold.svg" alt="" /></div>
              <div className="t"><b>{connName}</b><span>{connected ? "Live connection" : "Not connected yet"}</span></div>
              <span className={`${connected ? "st-ok" : "st-warn"}`}>{connected ? "Connected" : "Disconnected"}</span>
            </div>
            <div className="hrow">
              <div className="ic"><img src="https://cdn.joyverse.fun/mira-assets/phosphor/bold/lightning-bold.svg" alt="" /></div>
              <div className="t"><b>Webhook endpoint</b><span>Inbound messages received live</span></div>
              <span className={`${connected ? "st-ok" : "st-warn"}`}>{connected ? "Active" : "Idle"}</span>
            </div>
            <div className="hrow">
              <div className="ic warn"><img src="https://cdn.joyverse.fun/mira-assets/phosphor/bold/warning-circle-bold.svg" alt="" /></div>
              <div className="t"><b>Access token</b><span>Auto-renews on activity</span></div>
              <span className={`${connected ? "st-ok" : "st-warn"}`}>{connected ? "Active" : "Missing"}</span>
              {!connected && <a className="btn btn-soft" href="/onboarding">Connect</a>}
            </div>
          </div>
        </div>

        <div className="bottom">
          <div className="panel">
            <div className="phead"><b>Recent conversations</b><div className="r"><a className="lnk" href="/inbox">Open inbox →</a></div></div>
            <div className="krows" style={{ padding: "6px 8px" }}>
              {recents.rows.length === 0 && (
                <div style={{ padding: "14px", color: "var(--ink-3)", fontSize: "11px" }}>No messages yet.</div>
              )}
              {recents.rows.map((r, i) => (
                <div key={i} className="krow">
                  <div className="av av-36" style={{ background: ["var(--chat)", "var(--ads)", "var(--social)", "var(--info)", "#7C6A46"][i % 5] }}>
                    {(r.name ?? "+" + r.wa_id).replace(/[^a-zA-Z0-9 ]/g, "").trim().split(/\s+/).map((s: string) => s[0]).join("").slice(0, 2).toUpperCase() || "?"}
                  </div>
                  <div className="t">
                    <div className="r1"><b>{r.name ?? "+" + r.wa_id}</b><span className="num">{fmt(r.created_at)}</span></div>
                    <div className="r2"><span className="tags"><span className="mini cust">{r.direction === "in" ? "← " : "→ "}{(r.body ?? "").slice(0, 42)}</span></span></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="phead"><b>Quick actions</b></div>
            <div className="qgrid">
              <a href="/broadcasts" style={{ display: "contents" }}>
                <div className="qa2">
                  <div className="ic"><img src="https://cdn.joyverse.fun/mira-assets/phosphor/bold/megaphone-bold.svg" alt="" style={{ color: "var(--ads-deep)", background: "var(--ads-tint)", borderRadius: 8, padding: 3, width: 21, height: 21 }} /></div>
                  <div className="t"><b>New Broadcast</b><span>Send a template to a segment</span></div>
                </div>
              </a>
              <a href="/templates" style={{ display: "contents" }}>
                <div className="qa2">
                  <div className="ic"><img src="https://cdn.joyverse.fun/mira-assets/phosphor/bold/notebook-bold.svg" alt="" style={{ color: "var(--chat-deep)", background: "var(--chat-tint)", borderRadius: 8, padding: 3, width: 21, height: 21 }} /></div>
                  <div className="t"><b>New Template</b><span>Draft &amp; submit for approval</span></div>
                </div>
              </a>
              <a href="/contacts" style={{ display: "contents" }}>
                <div className="qa2">
                  <div className="ic"><img src="https://cdn.joyverse.fun/mira-assets/phosphor/bold/user-plus-bold.svg" alt="" style={{ color: "var(--info)", background: "var(--info-tint)", borderRadius: 8, padding: 3, width: 21, height: 21 }} /></div>
                  <div className="t"><b>Add Contact</b><span>Browse the contact book</span></div>
                </div>
              </a>
              <a href="/automation" style={{ display: "contents" }}>
                <div className="qa2">
                  <div className="ic"><img src="https://cdn.joyverse.fun/mira-assets/phosphor/bold/lightning-bold.svg" alt="" style={{ color: "var(--grape-deep)", background: "var(--grape-tint)", borderRadius: 8, padding: 3, width: 21, height: 21 }} /></div>
                  <div className="t"><b>Automations</b><span>Review rules &amp; replies</span></div>
                </div>
              </a>
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}
