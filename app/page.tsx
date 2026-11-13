import { ensureDefaultWorkspace } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { draftToCampaign, performance, seedCampaigns } from "@/lib/ads";
import { getShellData } from "@/lib/shell";
import { ShellClient } from "@/components/ShellClient";
import { Icon } from "@/components/Icon";
import { PairBars, Spark } from "@/components/Charts";
import { avatarClass, initials } from "@/lib/ui";

export const dynamic = "force-dynamic";

/**
 * P1.5 Dashboard — design v2 (nextbiz-one-v2/dashboard). Leaf page. Leads with what needs attention,
 * then KPIs, 14-day activity, recent chats, last broadcast funnel, automation, connection health.
 * Fresh workspaces see a setup checklist instead of empty widgets. Everything here is live data
 * except the NextBiz Ads teaser, which is badged as demo.
 */
const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const keyOf = (d: unknown) => (d instanceof Date ? dayKey(d) : String(d).slice(0, 10));
const n = (v: number) => v.toLocaleString("en-IN");
function delta(cur: number, prev: number, unit = "vs prior 14 days") {
  if (prev === 0) return cur === 0 ? <span className="foot">No activity yet</span> : <span className="foot"><span className="delta up"><Icon name="arrow-up-right" size="xs" />New</span>{unit}</span>;
  const pct = Math.round(((cur - prev) / prev) * 100);
  return <span className="foot"><span className={`delta ${pct >= 0 ? "up" : "down"}`}><Icon name="arrow-up-right" size="xs" style={pct < 0 ? { transform: "rotate(90deg)" } : undefined} />{Math.abs(pct)}%</span>{unit}</span>;
}
function since(iso: string | Date | null) {
  if (!iso) return "never";
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now"; if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60); if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)} days ago`;
}

export default async function HomePage() {
  const p = getPool();
  const [shell, wsId] = await Promise.all([getShellData(), ensureDefaultWorkspace()]);
  const q = <T = Record<string, unknown>>(sql: string) => p.query(sql).then((r) => r.rows as T[]).catch(() => [] as T[]);
  const [msgs14, msgTrend, convTrend, contacts30, contacts14, active24, unreadConvs, closing, rejected, approvedTpl, recents, lastBc, autoLog, autoSet, lastIn, anyIn, contactsTotal, adDrafts] = await Promise.all([
    q<{ d: Date; direction: string; n: number }>(`SELECT date_trunc('day', created_at)::date AS d, direction, count(*)::int AS n FROM messages WHERE created_at > now() - interval '14 days' GROUP BY 1,2`),
    q<{ cur: number; prev: number }>(`SELECT (SELECT count(*)::int FROM messages WHERE created_at > now() - interval '14 days') AS cur,
            (SELECT count(*)::int FROM messages WHERE created_at > now() - interval '28 days' AND created_at <= now() - interval '14 days') AS prev`),
    q<{ cur: number; prev: number }>(`SELECT (SELECT count(DISTINCT conversation_id)::int FROM messages WHERE created_at > now() - interval '14 days') AS cur,
            (SELECT count(DISTINCT conversation_id)::int FROM messages WHERE created_at > now() - interval '28 days' AND created_at <= now() - interval '14 days') AS prev`),
    q<{ cur: number; prev: number; opted: number }>(`SELECT (SELECT count(*)::int FROM contacts WHERE created_at > now() - interval '30 days') AS cur,
            (SELECT count(*)::int FROM contacts WHERE created_at > now() - interval '60 days' AND created_at <= now() - interval '30 days') AS prev,
            (SELECT count(*)::int FROM contacts WHERE opt_in) AS opted`),
    q<{ d: Date; n: number }>(`SELECT date_trunc('day', created_at)::date AS d, count(*)::int AS n FROM contacts WHERE created_at > now() - interval '14 days' GROUP BY 1`),
    q<{ n: number }>(`SELECT count(*)::int AS n FROM conversations WHERE last_inbound_at > now() - interval '24 hours'`),
    q<{ n: number; oldest: Date | null }>(`SELECT count(*)::int AS n, min(first_unread) AS oldest FROM (
            SELECT c.id, min(m.created_at) AS first_unread FROM conversations c JOIN messages m ON m.conversation_id = c.id
             WHERE m.direction = 'in' AND m.created_at > COALESCE(c.last_read_at, to_timestamp(0)) GROUP BY c.id) u`),
    q<{ n: number }>(`SELECT count(*)::int AS n FROM conversations c WHERE c.last_inbound_at BETWEEN now() - interval '24 hours' AND now() - interval '21 hours'
            AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id AND m.direction = 'out' AND m.created_at > c.last_inbound_at)`),
    q<{ name: string }>(`SELECT name FROM templates WHERE lower(status) = 'rejected' ORDER BY updated_at DESC`),
    q<{ n: number }>(`SELECT count(*)::int AS n FROM templates WHERE lower(status) = 'approved'`),
    q<{ id: string; name: string | null; wa_id: string; body: string | null; created_at: Date; direction: string; unread: number }>(
      `SELECT c.id, ct.name, ct.wa_id, lm.body, lm.created_at, lm.direction,
              (SELECT count(*)::int FROM messages m WHERE m.conversation_id = c.id AND m.direction = 'in' AND m.created_at > COALESCE(c.last_read_at, to_timestamp(0))) AS unread
         FROM conversations c JOIN contacts ct ON ct.id = c.contact_id
         JOIN LATERAL (SELECT body, created_at, direction FROM messages m WHERE m.conversation_id = c.id ORDER BY created_at DESC LIMIT 1) lm ON true
        ORDER BY lm.created_at DESC LIMIT 5`),
    q<{ id: string; name: string; sent_at: Date | null; created_at: Date; total: number; sent: number; delivered: number; read: number; failed: number; replied: number }>(
      `SELECT b.id, b.name, b.sent_at, b.created_at,
              count(br.id)::int AS total,
              count(*) FILTER (WHERE br.status IN ('sent','delivered','read'))::int AS sent,
              count(*) FILTER (WHERE br.status IN ('delivered','read'))::int AS delivered,
              count(*) FILTER (WHERE br.status = 'read')::int AS read,
              count(*) FILTER (WHERE br.status = 'failed')::int AS failed,
              (SELECT count(DISTINCT c.contact_id)::int FROM messages m JOIN conversations c ON c.id = m.conversation_id
                WHERE m.direction = 'in' AND b.sent_at IS NOT NULL AND m.created_at > b.sent_at
                  AND c.contact_id IN (SELECT contact_id FROM broadcast_recipients WHERE broadcast_id = b.id)) AS replied
         FROM broadcasts b LEFT JOIN broadcast_recipients br ON br.broadcast_id = b.id
        WHERE b.sent_at IS NOT NULL GROUP BY b.id ORDER BY b.sent_at DESC LIMIT 1`),
    q<{ type: string; n: number }>(`SELECT type, count(*)::int AS n FROM automation_log WHERE created_at > now() - interval '7 days' GROUP BY 1`),
    q<{ welcome_enabled: boolean; away_enabled: boolean }>(`SELECT welcome_enabled, away_enabled FROM automation_settings LIMIT 1`),
    q<{ at: Date | null }>(`SELECT max(created_at) AS at FROM messages WHERE direction = 'in'`),
    q<{ n: number }>(`SELECT count(*)::int AS n FROM messages WHERE direction = 'in'`),
    q<{ n: number }>(`SELECT count(*)::int AS n FROM contacts`),
    q(`SELECT id, name, objective, status, daily_budget, start_time, stop_time, destination FROM ads_mock_campaigns ORDER BY created_at DESC`),
  ]);

  // 14-day series
  const days: string[] = [], labels: string[] = [];
  for (let i = 13; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push(dayKey(d)); labels.push(d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })); }
  const series = (rows: { d: unknown; n: number }[]) => { const m = new Map(rows.map((r) => [keyOf(r.d), r.n])); return days.map((k) => m.get(k) ?? 0); };
  const inS = series(msgs14.filter((r) => r.direction === "in")), outS = series(msgs14.filter((r) => r.direction === "out"));
  const totS = inS.map((v, i) => v + outS[i]);
  const contactS = series(contacts14);

  const connected = !!shell.wa?.connected;
  const mt = msgTrend[0] ?? { cur: 0, prev: 0 }, ct = convTrend[0] ?? { cur: 0, prev: 0 }, c30 = contacts30[0] ?? { cur: 0, prev: 0, opted: 0 };
  const un = unreadConvs[0] ?? { n: 0, oldest: null };
  const setup = [
    { done: connected, t: "Connect WhatsApp", s: connected ? shell.wa?.displayName ?? "Connected" : "Link your business number", href: "/onboarding" },
    { done: (anyIn[0]?.n ?? 0) > 0, t: "Receive your first message", s: (anyIn[0]?.n ?? 0) > 0 ? "Messages are flowing" : "Send “Hi” from your phone to test", href: "/onboarding" },
    { done: !!autoSet[0]?.welcome_enabled, t: "Turn on a welcome message", s: "Instant reply for every new customer · 1 min", href: "/automation" },
    { done: (contactsTotal[0]?.n ?? 0) >= 10, t: "Add your contacts", s: "Customers are added automatically when they message you", href: "/contacts" },
    { done: (approvedTpl[0]?.n ?? 0) > 0, t: "Get a template approved", s: "Needed to message customers after 24 hours", href: "/templates" },
  ];
  const setupDone = setup.filter((s) => s.done).length;
  const attention = [
    un.n > 0 && { href: "/inbox", tile: "green", icon: "tray", t: `${un.n} unread chat${un.n > 1 ? "s" : ""}`, s: `Oldest waiting ${since(un.oldest)}` },
    (closing[0]?.n ?? 0) > 0 && { href: "/inbox", tile: "banana", icon: "hourglass", t: `${closing[0].n} window${closing[0].n > 1 ? "s" : ""} closing`, s: "Reply within 3h or use a template" },
    rejected.length > 0 && { href: "/templates", tile: "red", icon: "warning-circle", t: `${rejected.length} template${rejected.length > 1 ? "s" : ""} rejected`, s: `${rejected[0].name} · fix & resubmit` },
    !connected && { href: "/settings#whatsapp", tile: "grape", icon: "plugs-connected", t: "WhatsApp not connected", s: "Messages can't arrive until you reconnect" },
  ].filter(Boolean) as { href: string; tile: string; icon: string; t: string; s: string }[];

  const bc = lastBc[0];
  const pct = (a: number) => (bc && bc.total > 0 ? Math.round((a / bc.total) * 100) : 0);
  const auto = Object.fromEntries(autoLog.map((r) => [r.type, r.n]));
  const autoTotal = autoLog.reduce((s, r) => s + r.n, 0);

  const adsRep = performance([...adDrafts.map((r) => draftToCampaign(r as never)), ...seedCampaigns(wsId)], 7, wsId);
  const inr = (v: number) => "₹" + Math.round(v).toLocaleString("en-IN");
  const hour = new Date().toLocaleString("en-GB", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" });
  const greet = +hour < 12 ? "Good morning" : +hour < 17 ? "Good afternoon" : "Good evening";
  const first = shell.userName.split(" ")[0].replace(/^./, (c) => c.toUpperCase());

  return (
    <ShellClient active="dashboard" title="Dashboard" data={shell}
      actions={<a className="btn btn-primary" href="/broadcasts?new=1"><Icon name="plus" /><span className="lbl">New broadcast</span></a>}>
      <div className="pg-dash">
        <div className="page" data-testid="dashboard">
          <div className="pagehead">
            <div className="t"><div className="h1">{greet}, {first}</div>
              <p>{new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short", timeZone: "Asia/Kolkata" })} · {attention.length ? "here's what needs you today." : "nothing urgent — you're all caught up."}</p></div>
            <span className="pill neutral nodot">Last 14 days</span>
          </div>

          {setupDone < setup.length && (
            <section className="card setup" style={{ display: "grid" }} data-testid="setup">
              <div className="l">
                <span className="eyebrow" style={{ color: "var(--chat-deep)" }}>Getting started</span>
                <h2>{setupDone <= 2 ? "Let's get your first customer chat in." : "Almost set up — a few steps left."}</h2>
                <p className="muted" style={{ fontSize: "var(--fs-sm)", maxWidth: 380 }}>Finish these and NextBiz One answers, organises and follows up on WhatsApp for you.</p>
                <div className="prog"><div className="meter"><span style={{ width: `${(setupDone / setup.length) * 100}%` }} /></div>{setupDone} of {setup.length} done</div>
              </div>
              <div className="steps">
                {setup.map((s) => (
                  <a key={s.t} className={`step${s.done ? " done" : ""}`} href={s.href}>
                    <span className="ck">{s.done && <Icon name="check" size="xs" />}</span>
                    <span className="grow"><b>{s.t}</b><small>{s.s}</small></span>
                    {!s.done && <Icon name="caret-right" style={{ color: "var(--ink-4)" }} />}
                  </a>
                ))}
              </div>
            </section>
          )}

          {attention.length > 0 && (
            <section className="attn" aria-label="Needs your attention">
              {attention.map((a) => (
                <a key={a.t} className="at" href={a.href}><span className={`icon-tile lg ${a.tile}`}><Icon name={a.icon} /></span><span className="grow"><b>{a.t}</b><small>{a.s}</small></span><Icon name="caret-right" size="sm" /></a>
              ))}
            </section>
          )}

          <section className="grid">
            <div className="card kpi s3"><div className="stat"><span className="lbl"><Icon name="chat-circle-dots" size="sm" />Messages</span><span className="val v">{n(mt.cur)}</span>{delta(mt.cur, mt.prev)}<div className="spark-wrap"><Spark data={totS} /></div></div></div>
            <div className="card kpi s3"><div className="stat"><span className="lbl"><Icon name="users-three" size="sm" />Conversations</span><span className="val v">{n(ct.cur)}</span>{delta(ct.cur, ct.prev)}<span className="foot">{active24[0]?.n ?? 0} active in the last 24h</span></div></div>
            <div className="card kpi s3"><div className="stat"><span className="lbl"><Icon name="user-plus" size="sm" />New contacts</span><span className="val v">{n(c30.cur)}</span>{delta(c30.cur, c30.prev, "vs prior 30 days")}<div className="spark-wrap"><Spark data={contactS} /></div></div></div>
            <div className="card kpi s3"><div className="stat"><span className="lbl"><Icon name="megaphone" size="sm" />Can receive broadcasts</span><span className="val v">{n(c30.opted)}</span><span className="foot">opted-in of {n(contactsTotal[0]?.n ?? 0)} contacts</span>
              <div className="meter" style={{ marginTop: 10 }}><span style={{ width: `${(contactsTotal[0]?.n ?? 0) ? Math.round((c30.opted / contactsTotal[0].n) * 100) : 0}%` }} /></div></div></div>

            <div className="card s8">
              <div className="card-h"><span className="h3">WhatsApp activity</span><div className="legend"><span><i style={{ background: "var(--chat)" }} />Received</span><span><i style={{ background: "#C9C1B1" }} />Sent</span></div></div>
              <div className="chart">{totS.some((v) => v > 0) ? <PairBars a={inS} b={outS} labels={labels} /> : (
                <div className="zero-chart" style={{ display: "grid" }}><span><Icon name="chart-bar" size="xl" style={{ color: "var(--ink-4)" }} /><br />Your daily message volume shows up here<br />after the first conversations.</span></div>)}</div>
            </div>
            <div className="card s4">
              <div className="card-h"><span className="h3">Recent chats</span><a className="btn-link" href="/inbox">Open inbox<Icon name="arrow-right" size="xs" /></a></div>
              <div className="rc">
                {recents.length === 0 && <div className="empty" style={{ padding: 20 }}><p>No conversations yet.</p></div>}
                {recents.map((r) => (
                  <a key={r.id} href="/inbox"><span className={`av ${avatarClass(r.wa_id)}`}>{initials(r.name, r.wa_id)}</span>
                    <span className="grow trunc"><b>{r.name ?? `+${r.wa_id}`}</b><small className="trunc">{r.direction === "out" ? "You: " : ""}{r.body ?? "—"}</small></span>
                    <span className="tm">{since(r.created_at)}{r.unread > 0 && <span className="badge">{r.unread}</span>}</span></a>
                ))}
              </div>
            </div>

            <div className="card s4 pair">
              <div className="card-h"><span className="h3">Last broadcast</span>{bc && <span className="pill ok sm">Sent</span>}</div>
              {bc ? (
                <>
                  <div className="card-b" style={{ paddingTop: 0 }}>
                    <div className="row" style={{ marginBottom: 14 }}><span className="icon-tile sm"><Icon name="megaphone" /></span><span className="grow"><b style={{ fontSize: "var(--fs-sm)" }}>{bc.name}</b><br /><small className="faint xs" style={{ fontWeight: 600 }}>{bc.sent_at && new Date(bc.sent_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} · {bc.total} recipients</small></span></div>
                    <div className="funnel">
                      {([["Sent", bc.sent], ["Delivered", bc.delivered], ["Read", bc.read], ["Replied", bc.replied]] as const).map(([l, v]) => (
                        <div key={l} className="fr"><span>{l}</span><div className="bar"><span style={{ width: `${Math.max(pct(v), v > 0 ? 6 : 0)}%` }}>{v}</span></div><span className="v">{pct(v)}%</span></div>
                      ))}
                    </div>
                  </div>
                  <div className="card-f"><span className="xs faint grow" style={{ fontWeight: 600 }}>{bc.failed > 0 ? `${bc.failed} failed to deliver` : "No delivery failures"}</span><a className="btn-link" href="/broadcasts">Report</a></div>
                </>
              ) : (
                <div className="empty" style={{ paddingTop: 8 }}><p>Send an approved template to your opted-in contacts — results show up here.</p><div className="acts"><a className="btn btn-soft btn-sm" href="/broadcasts?new=1">New broadcast</a></div></div>
              )}
            </div>
            <div className="card s4 pair">
              <div className="card-h"><span className="h3">Automation · 7 days</span><a className="btn-link" href="/automation">Manage</a></div>
              <div className="card-b auto-rows" style={{ paddingTop: 0 }}>
                <div className="ar"><span className="icon-tile sm green"><Icon name="hand" /></span><span><b>Welcome message</b><small>{autoSet[0]?.welcome_enabled ? "On" : "Off"} · greets new contacts</small></span><span className="v">{auto.welcome ?? 0}</span></div>
                <div className="ar"><span className="icon-tile sm grape"><Icon name="lightning" /></span><span><b>Keyword replies</b><small>Answers common questions</small></span><span className="v">{(auto.keyword ?? 0) + (auto.rule ?? 0)}</span></div>
                <div className="ar"><span className="icon-tile sm"><Icon name="clock" /></span><span><b>Away replies</b><small>{autoSet[0]?.away_enabled ? "On" : "Off"} · outside business hours</small></span><span className="v">{auto.away ?? 0}</span></div>
                {autoTotal === 0 && <p className="xs faint" style={{ fontWeight: 600, paddingTop: 8 }}>No automatic replies sent this week.</p>}
              </div>
            </div>
            <div className="card s4">
              <div className="card-h"><span className="h3">Connection health</span><a className="btn-link" href="/settings#whatsapp">Settings</a></div>
              <div className="card-b hl" style={{ paddingTop: 0 }}>
                <div className="hrow"><span className={`icon-tile sm ${connected ? "green" : "banana"}`}><Icon name="whatsapp-logo" /></span><span className="grow"><b>WhatsApp number</b><small>{shell.wa?.displayName ?? "Not connected"}</small></span><span className={`pill sm ${connected ? "ok" : "warn"}`}>{connected ? "Live" : "Offline"}</span></div>
                <div className="hrow"><span className="icon-tile sm green"><Icon name="plugs-connected" /></span><span className="grow"><b>Incoming messages</b><small>Last received {since(lastIn[0]?.at ?? null)}</small></span><span className={`pill sm ${lastIn[0]?.at ? "ok" : "neutral"}`}>{lastIn[0]?.at ? "Healthy" : "Waiting"}</span></div>
                <div className="hrow"><span className="icon-tile sm grape"><Icon name="notebook" /></span><span className="grow"><b>Templates</b><small>{approvedTpl[0]?.n ?? 0} approved · {rejected.length} rejected</small></span><a className="btn btn-soft btn-sm" href="/templates">View</a></div>
              </div>
            </div>

            <div className="card ads s12">
              <div className="card-h"><span className="icon-tile sm orange"><Icon name="megaphone" /></span><span className="h3">NextBiz Ads <span className="demo" style={{ marginLeft: 6, verticalAlign: 1 }}>Demo data</span></span><a className="btn-link" style={{ color: "var(--ads-deep)" }} href="/ads/performance">View performance<Icon name="arrow-right" size="xs" /></a></div>
              <div className="card-b row wrap gap-16" style={{ paddingTop: 0 }}>
                <div className="nums grow" style={{ minWidth: 280 }}><div><span>Spend · 7d</span><b>{inr(adsRep.totals.spend)}</b></div><div><span>Results</span><b>{n(adsRep.totals.results)}</b></div><div><span>Cost / result</span><b>{inr(adsRep.totals.cost_per_result)}</b></div></div>
                <p className="small muted" style={{ maxWidth: 360 }}>Click-to-WhatsApp ads land straight in your inbox. Connect an ad account to replace this demo data with your real campaigns.</p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </ShellClient>
  );
}
