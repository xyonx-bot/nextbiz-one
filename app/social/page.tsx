import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Icon } from "@/components/Icon";
import { PairBars } from "@/components/Charts";
import { getShellData } from "@/lib/shell";
import { listComments, mediaFor, recentDmThreads, socialAccount, socialPosts, socialProfile, socialStats, commentCounts } from "@/lib/social";
import { avatarClass } from "@/lib/ui";

export const dynamic = "force-dynamic";

/**
 * NextBiz Social — Overview. The Instagram account at a glance: profile, what needs a reply,
 * this week's DMs/comments/auto-replies, 14-day activity, recent posts (click → their comments),
 * and the latest comments + DMs. Live profile/posts come from the Graph API; the rest from our DB.
 */
const n = (v: number | null | undefined) => (v == null ? "—" : v >= 10000 ? `${(v / 1000).toFixed(v >= 100000 ? 0 : 1)}k` : v.toLocaleString("en-IN"));
function ago(iso: string | Date | null) {
  if (!iso) return "";
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "now"; if (m < 60) return `${m}m`; const h = Math.floor(m / 60); if (h < 24) return `${h}h`; return `${Math.floor(h / 24)}d`;
}
function delta(cur: number, prev: number) {
  if (!prev) return cur ? <span className="delta up">New</span> : <span className="muted">—</span>;
  const p = Math.round(((cur - prev) / prev) * 100);
  return <span className={`delta ${p >= 0 ? "up" : "down"}`}>{p >= 0 ? "+" : "−"}{Math.abs(p)}%</span>;
}
const handle = (u: string | null, fallback = "someone") => (u ? `@${u.replace(/^@/, "")}` : fallback);

export default async function SocialPage() {
  const shell = await getShellData();
  if (!shell.wsId) redirect("/login?next=/social");
  const wsId = shell.wsId;
  const acct = await socialAccount(wsId);
  if (!acct) {
    return <AppShell active="social" requires="social" title="Overview"><div /></AppShell>;
  }
  const [profile, posts, stats, counts, needs, dms] = await Promise.all([
    socialProfile(acct), socialPosts(acct, 12), socialStats(wsId), commentCounts(wsId), listComments(wsId, { filter: "needs", limit: 5 }), recentDmThreads(wsId, 5),
  ]);
  const media = await mediaFor(wsId, needs);
  const user = (acct.username ?? "instagram").replace(/^@/, "");
  const labels = stats.daily.map((d) => new Date(d.d).toLocaleDateString("en-GB", { day: "numeric", month: "short" }));
  const autoTotal = (stats.auto.dms ?? 0) + (stats.auto.comments ?? 0);
  const pic = profile.picture ?? acct.profile_picture_url;

  return (
    <AppShell active="social" requires="social" title="Overview">
      <div className="pg-social" data-testid="social-overview">
        {/* profile hero */}
        <section className="card sx-hero">
          <span className="blob b1" /><span className="blob b2" /><span className="blob b3" />
          <div className="sx-id">
            <span className="ring">{pic ? <img src={pic} alt="" /> : <span className={`av xl ${avatarClass(user)}`}>{user.slice(0, 2).toUpperCase()}</span>}</span>
            <div className="grow">
              <div className="row gap-6 wrap"><h1>@{user}</h1><span className="pill ok sm">{acct.webhook_subscribed ? "Live" : "Connected"}</span></div>
              <p>{profile.name ?? acct.display_name ?? "Instagram professional account"}</p>
              <div className="sx-counts">
                <span><b className="num">{n(profile.posts)}</b>posts</span>
                <span><b className="num">{n(profile.followers)}</b>followers</span>
                <span><b className="num">{n(profile.follows)}</b>following</span>
              </div>
            </div>
          </div>
          <div className="sx-acts">
            <a className="btn btn-primary" href="/social/comments?filter=needs" data-testid="sx-needs-btn"><Icon name="chat-teardrop-text" />{counts.needs ? `${counts.needs} need${counts.needs === 1 ? "s" : ""} a reply` : "All caught up"}</a>
            <a className="btn btn-soft" href="/inbox?ch=ig"><Icon name="paper-plane-tilt" />Instagram DMs</a>
            <a className="btn btn-ghost" href={`https://www.instagram.com/${user}/`} target="_blank" rel="noreferrer"><Icon name="arrow-square-out" />Open profile</a>
          </div>
        </section>

        {/* KPIs */}
        <div className="sx-kpis">
          <a className={`card sx-kpi hot${counts.needs ? "" : " calm"}`} href="/social/comments?filter=needs" data-testid="kpi-needs">
            <span className="icon-tile pink"><Icon name="chat-teardrop-text" /></span>
            <span className="v num">{counts.needs}</span><span className="l">Comments need a reply</span>
            <span className="f">{counts.needs ? "Oldest first in Comments" : "Nothing waiting — nice"}</span>
          </a>
          <div className="card sx-kpi"><span className="icon-tile grape"><Icon name="paper-plane-tilt" /></span>
            <span className="v num">{stats.dm.cur ?? 0}</span><span className="l">DMs this week</span><span className="f">{delta(stats.dm.cur ?? 0, stats.dm.prev ?? 0)} · {stats.dm.people ?? 0} people</span></div>
          <div className="card sx-kpi"><span className="icon-tile banana"><Icon name="chat-text" /></span>
            <span className="v num">{stats.cm.cur ?? 0}</span><span className="l">Comments this week</span><span className="f">{delta(stats.cm.cur ?? 0, stats.cm.prev ?? 0)} vs last week</span></div>
          <div className="card sx-kpi"><span className="icon-tile green"><Icon name="lightning" /></span>
            <span className="v num">{autoTotal}</span><span className="l">Auto-replies this week</span><span className="f">{stats.auto.dms ?? 0} DMs · {stats.auto.comments ?? 0} comments</span></div>
        </div>

        <div className="sx-grid">
          <section className="card sx-chart">
            <div className="card-h"><span className="grow"><span className="h2">Activity</span><small className="xs faint" style={{ display: "block", fontWeight: 600 }}>DMs and comments, last 14 days</small></span></div>
            <div style={{ padding: "0 var(--pad) var(--pad)" }}>
              <PairBars a={stats.daily.map((d) => d.dms)} b={stats.daily.map((d) => d.comments)} labels={labels} colors={["var(--social)", "var(--grape)"]} names={["DMs", "Comments"]} height={200} />
            </div>
          </section>
          <section className="card sx-auto">
            <div className="card-h"><span className="grow"><span className="h2">Auto-replies</span><small className="xs faint" style={{ display: "block", fontWeight: 600 }}>What answers for you on Instagram</small></span></div>
            <ul>
              <li><span className={`dotx ${stats.settings.welcome_enabled ? "on" : ""}`} /><span className="grow"><b>Welcome DM</b><small>First message from a new person</small></span><span className={`pill sm ${stats.settings.welcome_enabled ? "ok" : "neutral"}`}>{stats.settings.welcome_enabled ? "On" : "Off"}</span></li>
              <li><span className={`dotx ${stats.settings.away_enabled ? "on" : ""}`} /><span className="grow"><b>Away message</b><small>Outside business hours</small></span><span className={`pill sm ${stats.settings.away_enabled ? "ok" : "neutral"}`}>{stats.settings.away_enabled ? "On" : "Off"}</span></li>
              <li><span className={`dotx ${stats.rules.dm ? "on" : ""}`} /><span className="grow"><b>Keyword replies in DMs</b><small>Rules with “Instagram DM” on</small></span><span className="cnt num">{stats.rules.dm ?? 0}</span></li>
              <li><span className={`dotx ${stats.rules.comment ? "on" : ""}`} /><span className="grow"><b>Comment → DM rules</b><small>Private reply, optional public reply</small></span><span className="cnt num">{stats.rules.comment ?? 0}</span></li>
            </ul>
            <div style={{ padding: "0 var(--pad) var(--pad)" }}><a className="btn btn-soft btn-sm" href="/automation" style={{ width: "100%", justifyContent: "center" }}><Icon name="lightning" />Manage auto-replies</a></div>
          </section>
        </div>

        {/* posts */}
        <section className="card sx-posts">
          <div className="card-h"><span className="grow"><span className="h2">Recent posts</span><small className="xs faint" style={{ display: "block", fontWeight: 600 }}>Tap a post to see and answer its comments</small></span>
            <a className="btn btn-ghost btn-sm" href="/social/comments">All comments<Icon name="arrow-right" /></a></div>
          {posts.length ? (
            <div className="pgrid">
              {posts.map((p) => (
                <a key={p.id} className="post" href={`/social/comments?media=${p.id}`} title={p.caption ?? ""}>
                  {p.thumb ? <img src={p.thumb} alt="" loading="lazy" /> : <span className="ph"><Icon name={p.type === "VIDEO" ? "play" : "image"} /></span>}
                  {p.type === "VIDEO" && <span className="kind"><Icon name="play" size="xs" /></span>}
                  {p.type === "CAROUSEL_ALBUM" && <span className="kind"><Icon name="copy" size="xs" /></span>}
                  <span className="ov"><span><Icon name="heart-fill" size="xs" />{n(p.likes)}</span><span><Icon name="chat-circle-dots" size="xs" />{n(p.comments)}</span></span>
                </a>
              ))}
            </div>
          ) : (
            <div className="pgrid ghost">{Array.from({ length: 6 }).map((_, i) => <span key={i} className="post"><span className="ph"><Icon name="image" /></span></span>)}
              <p className="ghost-note">Posts appear here once Instagram shares them with NextBiz One.</p></div>
          )}
        </section>

        <div className="sx-grid two">
          <section className="card sx-list">
            <div className="card-h"><span className="grow"><span className="h2">Needs a reply</span></span><a className="btn btn-ghost btn-sm" href="/social/comments?filter=needs">Open<Icon name="arrow-right" /></a></div>
            {needs.length ? needs.map((c) => {
              const m = c.media_id ? media[c.media_id] : null;
              return (
                <a key={c.id} className="sx-row" href={`/social/comments?c=${c.id}`}>
                  <span className={`av ${avatarClass(c.from_id ?? c.id)}`}>{(c.from_name ?? "?").replace(/^@/, "").slice(0, 2).toUpperCase()}</span>
                  <span className="grow"><b>{handle(c.from_name)}</b><small className="trunc" style={{ display: "block" }}>{c.text ?? "(no text)"}</small></span>
                  <span className="tm">{ago(c.created_at)}</span>
                  {m?.thumb ? <img className="mini" src={m.thumb} alt="" /> : <span className="mini ph"><Icon name="image" size="xs" /></span>}
                </a>
              );
            }) : <div className="empty" style={{ padding: "22px 16px" }}><div className="art"><Icon name="check-circle" /></div><h3>All caught up</h3><p>New comments that no rule answered land here.</p></div>}
          </section>
          <section className="card sx-list">
            <div className="card-h"><span className="grow"><span className="h2">Latest DMs</span></span><a className="btn btn-ghost btn-sm" href="/inbox?ch=ig">Inbox<Icon name="arrow-right" /></a></div>
            {dms.length ? dms.map((t) => (
              <a key={t.id} className={`sx-row${t.unread ? " unread" : ""}`} href="/inbox?ch=ig">
                <span className={`av ${avatarClass(t.id)}`}>{(t.username ?? t.name ?? "?").replace(/^@/, "").slice(0, 2).toUpperCase()}</span>
                <span className="grow"><b>{handle(t.username, t.name ?? "Instagram user")}</b><small className="trunc" style={{ display: "block" }}>{t.direction === "out" ? "You: " : ""}{t.body ?? "(media)"}</small></span>
                <span className="tm">{ago(t.created_at)}</span>
                {t.unread > 0 && <span className="badge">{t.unread}</span>}
              </a>
            )) : <div className="empty" style={{ padding: "22px 16px" }}><div className="art"><Icon name="paper-plane-tilt" /></div><h3>No DMs yet</h3><p>Messages to @{user} show up here and in the inbox.</p></div>}
          </section>
        </div>
      </div>
    </AppShell>
  );
}
