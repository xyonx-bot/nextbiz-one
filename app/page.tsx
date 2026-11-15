import { redirect } from "next/navigation";
import { getShellData } from "@/lib/shell";
import { dashboardData } from "@/lib/dashboard";
import { ShellClient } from "@/components/ShellClient";
import { Icon } from "@/components/Icon";
import { AvatarPic } from "@/components/AvatarPic";
import { igPic } from "@/lib/ui";
import { PairBars, Spark } from "@/components/Charts";
import { AskAi, CopyLink, CountUp } from "@/components/DashBits";
import { Hint } from "@/components/Hint";
import { avatarClass, initials } from "@/lib/ui";

export const dynamic = "force-dynamic";

/**
 * Dashboard v3 — composed from the channels the workspace actually has (WhatsApp, Instagram, Meta ads).
 *  · New workspace: Getting started + a Launch pad (share links, first test) instead of a wall of zeros.
 *  · Active workspace: what needs you (all channels) → pulse (conversations, contacts, median reply time,
 *    automatic replies) → messages per day by channel + latest chats → channel cards.
 *  · No demo numbers anywhere: ads show live figures only when an ad account is connected.
 */
const n = (v: number) => v.toLocaleString("en-IN");
const inr = (v: number) => "₹" + Math.round(v).toLocaleString("en-IN");
function since(iso: string | null) {
  if (!iso) return "never";
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now"; if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60); if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)} days ago`;
}
function dur(s: number | null) {
  if (s == null) return "—";
  if (s < 60) return `${Math.max(1, Math.round(s))}s`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  if (s < 86400) return `${(s / 3600).toFixed(s < 36000 ? 1 : 0)} h`;
  return `${(s / 86400).toFixed(1)} days`;
}
function Delta({ cur, prev, unit }: { cur: number; prev: number; unit: string }) {
  if (!prev && !cur) return <span className="foot">Quiet so far · {unit}</span>;
  if (!prev) return <span className="foot"><span className="delta up"><Icon name="arrow-up-right" size="xs" />New</span>{unit}</span>;
  if (!cur) return <span className="foot"><span className="delta flat">Quiet</span>{unit}</span>;
  const p = Math.round(((cur - prev) / prev) * 100);
  return <span className="foot"><span className={`delta ${p >= 0 ? "up" : "down"}`}><Icon name="arrow-up-right" size="xs" style={p < 0 ? { transform: "rotate(90deg)" } : undefined} />{Math.abs(p)}%</span>{unit}</span>;
}

export default async function HomePage() {
  const shell = await getShellData();
  if (!shell.wsId) redirect("/login");
  const d = await dashboardData(shell.wsId);

  const anyChannel = d.wa.connected || !!d.ig || !!d.ads;
  const setup = [
    { done: d.wa.connected || !!d.ig, t: "Connect WhatsApp or Instagram", s: d.wa.connected ? d.wa.displayName ?? "WhatsApp connected" : d.ig ? `@${d.ig.username} connected` : "Bring your customer chats in", href: "/connections" },
    { done: d.everActive, t: "Receive your first message", s: d.everActive ? "Messages are flowing" : "Send “Hi” from your phone to test", href: d.wa.connected ? "/onboarding" : "/connections" },
    { done: !!(d.settings.welcome_enabled || d.settings.ig_welcome_enabled), t: "Turn on a welcome message", s: "Instant reply for every new customer · 1 min", href: d.wa.connected ? "/automation" : "/social/automation" },
    { done: d.contacts.total + d.contacts.ig_new >= 10, t: "Grow your contacts", s: "People are added automatically when they message you", href: "/contacts" },
    d.wa.connected
      ? { done: d.approvedTemplates > 0, t: "Get a template approved", s: "Needed to message customers after 24 hours", href: "/templates" }
      : { done: d.rulesOn > 0, t: "Add a keyword reply", s: "Answer “price?” and “timing?” automatically", href: d.ig ? "/social/automation" : "/automation" },
  ];
  const setupDone = setup.filter((s) => s.done).length;

  const attention = [
    d.unread.wa > 0 && { href: "/inbox?ch=wa", tile: "green", icon: "whatsapp-logo", t: `${d.unread.wa} unread WhatsApp chat${d.unread.wa > 1 ? "s" : ""}`, s: `Oldest waiting ${since(d.unread.oldest)}` },
    d.unread.ig > 0 && { href: "/social/dms", tile: "pink", icon: "instagram-logo", t: `${d.unread.ig} unread Instagram DM${d.unread.ig > 1 ? "s" : ""}`, s: "Reply within 24 hours" },
    (d.ig?.needs ?? 0) > 0 && { href: "/social/comments?filter=needs", tile: "pink", icon: "chat-teardrop-text", t: `${d.ig!.needs} comment${d.ig!.needs > 1 ? "s" : ""} need a reply`, s: "On your Instagram posts" },
    d.closing > 0 && { href: "/inbox", tile: "banana", icon: "hourglass", t: `${d.closing} reply window${d.closing > 1 ? "s" : ""} closing`, s: "Reply within 3h" },
    d.rejected.length > 0 && { href: "/templates", tile: "red", icon: "warning-circle", t: `${d.rejected.length} template${d.rejected.length > 1 ? "s" : ""} rejected`, s: `${d.rejected[0]} · fix & resubmit` },
    d.ig?.lastError && { href: "/connections#instagram", tile: "red", icon: "warning", t: "Instagram needs attention", s: d.ig.lastError.slice(0, 60) },
    d.ads?.error && { href: "/connections#ads", tile: "red", icon: "warning", t: "Ad account needs attention", s: d.ads.error.slice(0, 60) },
  ].filter(Boolean).slice(0, 4) as { href: string; tile: string; icon: string; t: string; s: string }[];

  const both = d.wa.connected && !!d.ig;
  const labels = d.days.map((x) => new Date(x + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" }));
  const totalIn = d.waIn.map((v, i) => v + d.igIn[i]);
  const quiet14 = d.totals.in14 === 0 && d.totals.out14 === 0;
  const waNumber = d.wa.displayName?.match(/\(([^)]+)\)/)?.[1]?.replace(/\D/g, "") ?? null;
  const bc = d.lastBc;
  const cardCount = [!!d.ig, d.wa.connected, anyChannel, !!d.ads].filter(Boolean).length;
  const span = cardCount >= 4 ? "s3" : cardCount === 3 ? "s4" : cardCount === 2 ? "s6" : "s12";
  const pct = (a: number) => (bc && bc.total > 0 ? Math.round((a / bc.total) * 100) : 0);
  const hour = +new Date().toLocaleString("en-GB", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" });
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const first = shell.userName.split(" ")[0].replace(/^./, (c) => c.toUpperCase());

  /* channel cards (broadcast · automation · ads · Instagram): what each channel did — near the top for live workspaces */
  const channelCards = (
            <section className="grid cards3">
              {d.ig && (
                <div className={`card ${span} ch-ig`} data-testid="card-ig">
                  <div className="card-h"><span className="icon-tile sm pink"><Icon name="instagram-logo" /></span><span className="h3">Instagram</span><a className="btn-link" style={{ color: "var(--social-deep)" }} href="/social">Social<Icon name="arrow-right" size="xs" /></a></div>
                  <div className="card-b" style={{ paddingTop: 0 }}>
                    <div className="nums3"><div><span>DMs · 7d</span><b>{n(d.ig.dms7)}</b></div><div><span>Comments · 7d</span><b>{n(d.ig.comments7)}</b></div><div className={d.ig.needs ? "hot" : ""}><span>Need a reply</span><b>{n(d.ig.needs)}</b></div></div>
                    <a className="btn btn-soft btn-sm" style={{ marginTop: 12, width: "100%", justifyContent: "center" }} href={d.ig.needs ? "/social/comments?filter=needs" : "/social/comments"}><Icon name="chat-teardrop-text" />{d.ig.needs ? "Reply to comments" : "See comments"}</a>
                  </div>
                </div>
              )}
              {d.wa.connected && (
                <div className={`card ${span}`}>
                  <div className="card-h"><span className="icon-tile sm green"><Icon name="megaphone" /></span><span className="h3">Last broadcast</span>{bc && <span className="pill ok sm">Sent</span>}</div>
                  {bc ? (
                    <div className="card-b" style={{ paddingTop: 0 }}>
                      <div className="xs faint" style={{ fontWeight: 600, marginBottom: 10 }}><b style={{ color: "var(--ink)" }}>{bc.name}</b> · {new Date(bc.sent_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} · {bc.total} recipients</div>
                      <div className="funnel">
                        {([["Sent", bc.sent], ["Delivered", bc.delivered], ["Read", bc.read], ["Replied", bc.replied]] as const).map(([l, v]) => (
                          <div key={l} className="fr"><span>{l}</span><div className="bar"><span style={{ width: `${Math.max(pct(v), v > 0 ? 6 : 0)}%` }}>{v}</span></div><span className="v">{pct(v)}%</span></div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="card-b first" style={{ paddingTop: 0 }}>
                      <p><b>{n(d.contacts.opted ?? 0)}</b> opted-in contact{d.contacts.opted === 1 ? "" : "s"} can get your first broadcast{d.approvedTemplates ? ` · ${d.approvedTemplates} approved template${d.approvedTemplates > 1 ? "s" : ""} ready` : " once a template is approved"}.</p>
                      <a className="btn btn-soft btn-sm" href={d.approvedTemplates ? "/broadcasts?new=1" : "/templates?new=1"}>{d.approvedTemplates ? "Send a broadcast" : "Create a template"}</a>
                    </div>
                  )}
                </div>
              )}
              {anyChannel && (
                <div className={`card ${span}`}>
                  <div className="card-h"><span className="icon-tile sm grape"><Icon name="lightning" /></span><span className="h3">Automation · 7 days</span><a className="btn-link" href={d.wa.connected ? "/automation" : "/social/automation"}>Manage</a></div>
                  <div className="card-b auto-rows" style={{ paddingTop: 0 }}>
                    <div className="ar"><span className="icon-tile sm green"><Icon name="hand" /></span><span><b>Welcome message</b><small>{[d.wa.connected && `WhatsApp ${d.settings.welcome_enabled ? "on" : "off"}`, d.ig && `Instagram ${d.settings.ig_welcome_enabled ? "on" : "off"}`].filter(Boolean).join(" · ")}</small></span><span className="v">{(d.auto.wa.welcome ?? 0)}</span></div>
                    <div className="ar"><span className="icon-tile sm grape"><Icon name="chat-text" /></span><span><b>Keyword replies</b><small>{d.rulesOn} rule{d.rulesOn === 1 ? "" : "s"} on</small></span><span className="v">{(d.auto.wa.keyword ?? 0) + (d.auto.wa.comment ?? 0)}</span></div>
                    <div className="ar"><span className="icon-tile sm"><Icon name="clock" /></span><span><b>Away replies</b><small>Outside business hours</small></span><span className="v">{d.auto.wa.away ?? 0}</span></div>
                    {d.ig && <div className="ar"><span className="icon-tile sm pink"><Icon name="instagram-logo" /></span><span><b>Instagram auto-DMs</b><small>Welcome + keyword DMs</small></span><span className="v">{d.auto.ig}</span></div>}
                  </div>
                </div>
              )}
              {d.ads ? (
                <div className={`card ${span} ch-ads`} data-testid="card-ads">
                  <div className="card-h"><span className="icon-tile sm orange"><Icon name="target" /></span><span className="h3">Ads · 7 days</span><a className="btn-link" style={{ color: "var(--ads-deep)" }} href="/ads/performance">Performance<Icon name="arrow-right" size="xs" /></a></div>
                  <div className="card-b" style={{ paddingTop: 0 }}>
                    {d.ads.error ? <p className="xs" style={{ color: "var(--danger-deep)", fontWeight: 600 }}>{d.ads.error}</p> : (
                      <>
                        <div className="nums3"><div><span>Spend</span><b>{inr(d.ads.spend)}</b></div><div><span>Results</span><b>{n(d.ads.results)}</b></div><div><span>Per result</span><b>{d.ads.results ? inr(d.ads.cpr) : "—"}</b></div></div>
                        <p className="xs faint" style={{ fontWeight: 600, marginTop: 10 }}>{d.ads.name} · {d.ads.active ? `${d.ads.active} campaign${d.ads.active > 1 ? "s" : ""} running` : "nothing running right now"}</p>
                      </>
                    )}
                    <a className="btn btn-soft btn-sm" style={{ marginTop: 10, width: "100%", justifyContent: "center" }} href={d.ads.active ? "/ads" : "/ads/new"}><Icon name={d.ads.active ? "target" : "plus"} />{d.ads.active ? "Campaigns" : "Create a campaign"}</a>
                  </div>
                </div>
              ) : null}
            </section>
  );
  /* "Your channels" strip stays last */
  const channelStrip = anyChannel ? (
          <section className="grid cards3">
            <div className="card s12 chstrip" data-testid="card-channels">
              <div className="card-h"><span className="icon-tile sm neutral"><Icon name="plugs-connected" /></span><span className="h3">Your channels</span><a className="btn-link" href="/connections">Manage</a></div>
              <div className="chs">
                <div className={`chi${d.wa.connected ? " on wa" : ""}`}><span className={`icon-tile ${d.wa.connected ? "green" : "neutral"}`}><Icon name="whatsapp-logo" /></span><span className="grow"><b>WhatsApp</b><small>{d.wa.connected ? `${d.wa.displayName ?? "Connected"} · last message ${since(d.wa.lastIn)}` : "Chats, templates and broadcasts on your number"}</small></span>
                  {d.wa.connected ? <span className="pill sm ok">Live</span> : <a className="btn btn-soft btn-sm" href="/connections#whatsapp">Connect</a>}</div>
                <div className={`chi${d.ig ? " on ig" : ""}`}><span className={`icon-tile ${d.ig ? "pink" : "neutral"}`}><Icon name="instagram-logo" /></span><span className="grow"><b>Instagram</b><small>{d.ig ? `@${d.ig.username} · last DM ${since(d.ig.lastIn)}` : "DMs and comments, answered in one place"}</small></span>
                  {d.ig ? <span className={`pill sm ${d.ig.lastError ? "warn" : "ok"}`}>{d.ig.lastError ? "Check" : "Live"}</span> : <a className="btn btn-soft btn-sm" href="/connections#instagram">Connect</a>}</div>
                <div className={`chi${d.ads ? " on ads" : ""}`}><span className={`icon-tile ${d.ads ? "orange" : "neutral"}`}><Icon name="target" /></span><span className="grow"><b>Meta Ads</b><small>{d.ads ? d.ads.name ?? "Ad account connected" : "Click-to-WhatsApp ads that land in your inbox"}</small></span>
                  {d.ads ? <span className={`pill sm ${d.ads.error ? "warn" : "ok"}`}>{d.ads.error ? "Check" : "Live"}</span> : <a className="btn btn-soft btn-sm" href="/connections#ads">Connect</a>}</div>
              </div>
            </div>
          </section>
  ) : null;

  return (
    <ShellClient active="dashboard" title="Dashboard" data={shell}
      actions={d.wa.connected ? <a className="btn btn-primary" href="/broadcasts?new=1"><Icon name="plus" /><span className="lbl">New broadcast</span></a> : undefined}>
      <div className="pg-dash v3"><CountUp />
        <div className="page" data-testid="dashboard" data-state={d.everActive ? "live" : "new"}>
          <div className="pagehead">
            <div className="t"><div className="h1">{greet}, {first}</div>
              <p>{new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short", timeZone: "Asia/Kolkata" })} · {!d.everActive ? "let's get your first customer chats in." : attention.length ? "here's what needs you today." : "nothing urgent — you're all caught up."}</p></div>
            {shell.ai && d.everActive && <AskAi prompt="What needs my attention today?" label="What needs me today?" testId="dash-ask-ai" />}
          </div>

          <Hint id="dash-learn" title="New: Learning center" text="Short guides on the 24-hour window, automation, templates and ads. Start with: use this number for automation, not long chats." guide="how-to-use-whatsapp-api" />

          {setupDone < setup.length && (
            <section className="card setup" style={{ display: "grid" }} data-testid="setup">
              <div className="l">
                <span className="eyebrow" style={{ color: "var(--chat-deep)" }}>Getting started</span>
                <h2>{setupDone <= 2 ? "Let's get your first customer chat in." : "Almost set up — a few steps left."}</h2>
                <p className="muted" style={{ fontSize: "var(--fs-sm)", maxWidth: 380 }}>Finish these and NextBiz One answers, organises and follows up on {both ? "WhatsApp and Instagram" : d.ig ? "Instagram" : "WhatsApp"} for you.</p>
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

          {d.everActive && (attention.length > 0 ? (
            <section className="attn" aria-label="Needs your attention" data-testid="attention">
              {attention.map((a) => (
                <a key={a.t} className="at" href={a.href}><span className={`icon-tile lg ${a.tile}`}><Icon name={a.icon} /></span><span className="grow"><b>{a.t}</b><small>{a.s}</small></span><Icon name="caret-right" size="sm" /></a>
              ))}
            </section>
          ) : (
            <section className="card calm" data-testid="all-caught-up">
              <span className="icon-tile lg green"><Icon name="check-circle" /></span>
              <span className="grow"><b>You&apos;re all caught up</b><small>No unread chats, no comments waiting, no windows closing.</small></span>
              <a className="btn btn-ghost btn-sm" href={d.wa.connected ? "/inbox" : "/social/dms"}>Open inbox<Icon name="arrow-right" size="xs" /></a>
            </section>
          ))}

          {!d.everActive ? (
            /* ── Launch pad: a brand-new workspace sees how to get its first chats, not zeros ── */
            <section className="card launch" data-testid="launch-pad">
              <div className="lp-preview" aria-hidden="true">
                <span className="eyebrow">Coming up here</span>
                <b>Your first week, at a glance</b>
                <div className="lp-kpis">{["Conversations", "New contacts", "Reply time", "Auto replies"].map((k) => <span key={k}><i />{k}</span>)}</div>
                <div className="lp-bars">{[30, 52, 41, 68, 46, 80, 62, 88, 57, 74, 66, 92, 71, 84].map((h, i) => <span key={i} style={{ height: `${h}%` }} />)}</div>
                <div className="lp-rows">{[0, 1, 2].map((i) => <div key={i}><span className={`av sm c${i + 1}`} /><span><i style={{ width: `${60 - i * 12}%` }} /><i style={{ width: `${40 + i * 10}%` }} /></span></div>)}</div>
              </div>
              <div className="lp-go">
                <img className="lp-art" src="/art/launch.webp" alt="" width={112} height={112} />
                <span className="eyebrow" style={{ color: "var(--chat-deep)" }}>Get your first messages</span>
                <h3>{anyChannel ? "Share your link — every message lands in your inbox." : "Connect a channel to start."}</h3>
                {waNumber && <CopyLink url={`https://wa.me/${waNumber}`} label="Your WhatsApp chat link" icon="whatsapp-logo" testId="share-wa" />}
                {d.ig?.username && <CopyLink url={`https://instagram.com/${d.ig.username}`} label="Your Instagram profile" icon="instagram-logo" testId="share-ig" />}
                {!d.wa.connected && <a className="lp-link" href="/connections#whatsapp"><span className="icon-tile sm green"><Icon name="whatsapp-logo" /></span><span className="grow"><b>Connect WhatsApp</b><small>Your business number, official Cloud API</small></span><Icon name="caret-right" size="sm" /></a>}
                {!d.ig && <a className="lp-link" href="/connections#instagram"><span className="icon-tile sm pink"><Icon name="instagram-logo" /></span><span className="grow"><b>Connect Instagram</b><small>DMs and comments in one place</small></span><Icon name="caret-right" size="sm" /></a>}
                {anyChannel && <div className="lp-tip"><Icon name="device-mobile" /><span><b>Test it now:</b> send “Hi” from your own phone — it shows up here within seconds.</span></div>}
                {shell.ai && <AskAi prompt="Write a friendly welcome message for new customers of my business, and suggest 3 keyword replies I should set up." label="Ask AI to write my welcome message" className="btn btn-soft ai-btn lp-ai" testId="dash-ai-welcome" />}
              </div>
            </section>
          ) : (
            <>
              {channelCards}
              <section className="grid">
                <div className="card kpi s3" data-testid="kpi-conv"><div className="stat"><span className="lbl"><Icon name="chat-circle-dots" size="sm" />Conversations</span><span className="val v" data-count>{n(d.convs.cur ?? 0)}</span><Delta cur={d.convs.cur ?? 0} prev={d.convs.prev ?? 0} unit="14 days" /><div className="spark-wrap"><Spark data={totalIn} /></div></div></div>
                <div className="card kpi s3"><div className="stat"><span className="lbl"><Icon name="user-plus" size="sm" />New contacts</span><span className="val v" data-count>{n((d.contacts.cur ?? 0) + (d.contacts.ig_new ?? 0))}</span><Delta cur={(d.contacts.cur ?? 0) + (d.contacts.ig_new ?? 0)} prev={d.contacts.prev ?? 0} unit="30 days" /><span className="foot sub">{n(d.contacts.opted ?? 0)} of {n(d.contacts.total ?? 0)} WhatsApp contacts opted in</span></div></div>
                <div className="card kpi s3" data-testid="kpi-reply"><div className="stat"><span className="lbl"><Icon name="timer" size="sm" />Reply time</span><span className="val v" data-count>{dur(d.reply.median_s)}</span>
                  <span className="foot">{d.reply.samples ? <>median first reply · {n(d.reply.samples)}, incl. automatic</> : "no replies in 14 days"}</span>
                  <div className="meter rt" style={{ marginTop: 10 }}><span style={{ width: `${d.reply.median_s == null ? 0 : Math.max(8, 100 - Math.min(100, (d.reply.median_s / 3600) * 100))}%` }} /></div></div></div>
                <div className="card kpi s3"><div className="stat"><span className="lbl"><Icon name="lightning" size="sm" />Automatic replies</span><span className="val v" data-count>{n(d.auto.total)}</span><span className="foot">sent for you · 7 days</span>
                  <span className="foot sub">{d.settings.welcome_enabled || d.settings.ig_welcome_enabled ? "Welcome message on" : "Welcome message off"} · {d.rulesOn} keyword rule{d.rulesOn === 1 ? "" : "s"}</span></div></div>

                <div className="card s8">
                  <div className="card-h"><span className="h3">Customer messages</span><span className="xs faint" style={{ fontWeight: 600 }}>14 days</span><span className="sp" />
                    <div className="legend">{both ? <><span><i style={{ background: "var(--chat)" }} />WhatsApp {n(d.totals.waIn)}</span><span><i style={{ background: "var(--social)" }} />Instagram {n(d.totals.igIn)}</span></>
                      : <><span><i style={{ background: d.ig ? "var(--social)" : "var(--chat)" }} />Received</span><span><i style={{ background: "#C9C1B1" }} />Sent</span></>}</div></div>
                  <div className="chart">{quiet14 ? (
                    <div className="quiet"><Icon name="clock" /><span><b>A quiet two weeks.</b> No messages since {since(d.wa.lastIn && d.ig?.lastIn ? (d.wa.lastIn > d.ig.lastIn ? d.wa.lastIn : d.ig.lastIn) : d.wa.lastIn ?? d.ig?.lastIn ?? null)} — a broadcast or a post can wake things up.</span></div>
                  ) : both ? <PairBars a={d.waIn} b={d.igIn} labels={labels} colors={["var(--chat)", "var(--social)"]} names={["WhatsApp", "Instagram"]} height={220} />
                    : d.ig ? <PairBars a={d.igIn} b={d.igOut} labels={labels} colors={["var(--social)", "#C9C1B1"]} names={["Received", "Sent"]} height={220} />
                    : <PairBars a={d.waIn} b={d.waOut} labels={labels} height={220} />}</div>
                </div>
                <div className="card s4">
                  <div className="card-h"><span className="h3">Latest conversations</span><a className="btn-link" href={d.wa.connected ? "/inbox" : "/social/dms"}>Inbox<Icon name="arrow-right" size="xs" /></a></div>
                  <div className="rc">
                    {d.recent.map((r) => (
                      <a key={`${r.ch}-${r.id}`} href={r.href}><span className={`av ${avatarClass(r.handle ?? r.id)}`}>{initials(r.who.replace(/^@/, ""), r.handle ?? "")}{r.ch === "ig" && <AvatarPic src={igPic(r.id)} />}<span className={`src ${r.ch}`}><Icon name={r.ch === "wa" ? "whatsapp-logo" : "instagram-logo"} /></span></span>
                        <span className="grow trunc"><b className="trunc">{r.who}</b><small className="trunc">{r.dir === "out" ? "You: " : ""}{r.body ?? "—"}</small></span>
                        <span className="tm">{since(r.at)}{r.unread > 0 && <span className={`badge${r.ch === "ig" ? " red" : ""}`}>{r.unread}</span>}</span></a>
                    ))}
                  </div>
                </div>
              </section>
            </>
          )}

          {!d.everActive && channelCards}
          {channelStrip}
        </div>
      </div>
    </ShellClient>
  );
}
