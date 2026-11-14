"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { Resizer, useStoredWidth } from "@/components/Resizer";
import { avatarClass } from "@/lib/ui";

/**
 * Comments — the Instagram comment inbox. list | post + conversation | person.
 * Every comment lands here; keyword rules answer what they can (private DM + optional public reply),
 * the rest waits in "Needs reply" until someone replies publicly, sends the one allowed private DM,
 * or dismisses it. Same layout language as the chat inbox: resizable columns, container-query breakpoints.
 */
type State = "needs" | "auto" | "replied" | "dismissed";
type C = {
  id: string; comment_id: string; from_id: string | null; from_name: string | null; media_id: string | null; text: string | null; created_at: string;
  dm_status: string | null; public_status: string | null; reply_text: string | null; reply_kind: string | null; replied_at: string | null; hidden_at: string | null;
  rule_name: string | null; rule_reply: string | null; rule_public: string | null; state: State;
};
type Media = { id: string; permalink: string | null; thumb: string | null; caption: string | null; type: string | null };
type Detail = { comment: C; onPost: C[]; person: { comments: number; since: string }; thread: { id: string } | null; media: Media | null };
type Filter = "needs" | "auto" | "replied" | "all";
const FILTERS: [Filter, string][] = [["needs", "Needs reply"], ["auto", "Auto"], ["replied", "Replied"], ["all", "All"]];

const handle = (u: string | null) => (u ? `@${u.replace(/^@/, "")}` : "Instagram user");
const ini = (u: string | null) => (u ?? "?").replace(/^@/, "").slice(0, 2).toUpperCase();
function ago(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "now"; if (m < 60) return `${m}m`; const h = Math.floor(m / 60); if (h < 24) return `${h}h`; const d = Math.floor(h / 24); return d < 7 ? `${d}d` : new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const privateUsed = (c: C) => c.dm_status === "sent" || c.reply_kind === "private";
const privateExpired = (c: C) => Date.now() - new Date(c.created_at).getTime() > 7 * 86400_000;

function Badges({ c }: { c: C }) {
  return (
    <span className="cbadges">
      {c.state === "needs" && <span className="cb needs"><span className="d" />Needs reply</span>}
      {c.dm_status === "sent" && c.reply_kind !== "private" && <span className="cb auto"><Icon name="lightning" size="xs" />Auto DM</span>}
      {c.public_status === "sent" && <span className="cb auto"><Icon name="lightning" size="xs" />Public reply</span>}
      {c.replied_at && <span className="cb you"><Icon name="check" size="xs" />{c.reply_kind === "private" ? "You DM'd" : "You replied"}</span>}
      {c.dm_status === "failed" && <span className="cb bad"><Icon name="warning" size="xs" />DM failed</span>}
      {c.state === "dismissed" && <span className="cb muted">Dismissed</span>}
    </span>
  );
}

export function CommentsClient({ username }: { username: string | null }) {
  const [filter, setFilter] = useState<Filter>("needs");
  const [mediaF, setMediaF] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [list, setList] = useState<C[] | null>(null);
  const [counts, setCounts] = useState<Record<Filter, number>>({ needs: 0, auto: 0, replied: 0, all: 0 });
  const [media, setMedia] = useState<Record<string, Media>>({});
  const [sel, setSel] = useState<string | null>(null);
  const [d, setD] = useState<Detail | null>(null);
  const [kind, setKind] = useState<"public" | "private">("public");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);
  const [view, setView] = useState<"list" | "detail">("list");
  const booted = useRef(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // resizable columns (same mechanics as the chat inbox)
  const wrapRef = useRef<HTMLDivElement>(null), lRef = useRef<HTMLElement>(null), pRef = useRef<HTMLElement>(null);
  const [lw, setLw] = useStoredWidth("nbo.comments.listW");
  const [pw, setPw] = useStoredWidth("nbo.comments.personW");
  const [geo, setGeo] = useState({ w: 0, l: 0, p: 0, pDocked: true });
  useEffect(() => {
    const el = wrapRef.current; if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => { const pe = pRef.current; const cs = pe ? getComputedStyle(pe) : null; setGeo({ w: el.clientWidth, l: lRef.current?.offsetWidth ?? 0, p: pe?.offsetWidth ?? 0, pDocked: !!cs && cs.display !== "none" }); };
    const ro = new ResizeObserver(measure); [el, lRef.current, pRef.current].forEach((x) => x && ro.observe(x)); measure();
    return () => ro.disconnect();
  }, []);

  const load = useCallback(async (f: Filter, m: string | null) => {
    const u = new URLSearchParams({ filter: f }); if (m) u.set("media", m);
    const r = await fetch(`/api/instagram/comments?${u}`, { cache: "no-store" }).then((x) => x.json()).catch(() => null);
    if (!r?.ok) { setList([]); return [] as C[]; }
    setList(r.comments); setCounts(r.counts); setMedia((prev) => ({ ...prev, ...r.media }));
    return r.comments as C[];
  }, []);
  const open = useCallback(async (id: string, push = true, refresh = false) => {
    setSel(id); setView("detail"); if (!refresh) setNote(null);
    if (push) { const u = new URL(window.location.href); u.searchParams.set("c", id); history.replaceState(null, "", u); }
    const r = await fetch(`/api/instagram/comments/${id}`, { cache: "no-store" }).then((x) => x.json()).catch(() => null);
    if (r?.ok) {
      setD(r);
      if (r.media) setMedia((prev) => ({ ...prev, [r.media.id]: r.media }));
      if (!refresh || privateUsed(r.comment)) setKind(privateUsed(r.comment) || privateExpired(r.comment) ? "public" : "private");
    }
  }, []);

  // boot from the URL: ?filter= ?media= ?c=
  useEffect(() => {
    if (booted.current) return; booted.current = true;
    const s = new URLSearchParams(window.location.search);
    const f = (s.get("filter") as Filter) || (s.get("media") || s.get("c") ? "all" : "needs");
    const m = s.get("media"); const c = s.get("c");
    setFilter(FILTERS.some(([k]) => k === f) ? f : "needs"); setMediaF(m);
    void load(FILTERS.some(([k]) => k === f) ? f : "needs", m).then((rows) => {
      const first = c ?? (window.innerWidth >= 900 ? rows[0]?.id : undefined);
      if (first) void open(first, !!c);
    });
  }, [load, open]);

  const pick = (f: Filter) => { setFilter(f); const u = new URL(window.location.href); u.searchParams.set("filter", f); history.replaceState(null, "", u); void load(f, mediaF); };
  const clearMedia = () => { setMediaF(null); const u = new URL(window.location.href); u.searchParams.delete("media"); history.replaceState(null, "", u); void load(filter, null); };

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (list ?? []).filter((c) => !s || (c.text ?? "").toLowerCase().includes(s) || (c.from_name ?? "").toLowerCase().includes(s));
  }, [list, q]);

  async function send() {
    if (!d || !text.trim()) return;
    setBusy(true); setNote(null);
    const r = await fetch(`/api/instagram/comments/${d.comment.id}/reply`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, text }) }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (!r?.ok) { setNote({ kind: "bad", text: r?.error ?? "Couldn't send — try again." }); return; }
    setText(""); setNote({ kind: "ok", text: kind === "public" ? "Reply posted under the comment" : "Private DM sent — the chat is in your inbox" });
    await Promise.all([load(filter, mediaF), open(d.comment.id, false, true)]);
  }
  async function dismiss(undo = false) {
    if (!d) return;
    await fetch(`/api/instagram/comments/${d.comment.id}/dismiss`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ undo }) });
    setNote({ kind: "ok", text: undo ? "Back in Needs reply" : "Dismissed — moved out of Needs reply" });
    await Promise.all([load(filter, mediaF), open(d.comment.id, false, true)]);
  }

  const c = d?.comment ?? null;
  const pm = (c?.media_id && media[c.media_id]) || d?.media || null;
  const fm = mediaF ? media[mediaF] : null;
  const pUsed = c ? privateUsed(c) : false, pExp = c ? privateExpired(c) : false;
  const ruleSuggestion = c?.rule_reply && !text ? c.rule_reply : null;
  const empty = list !== null && counts.all === 0;

  return (
    <div className="pg-social" style={{ height: "100%" }}>
      <div ref={wrapRef} className={`cx${view === "detail" ? " view-detail" : ""}`} data-data={empty ? "empty" : list === null ? "loading" : "full"} data-testid="comments"
        style={{ ...(lw ? { "--clw": `${lw}px` } : {}), ...(pw ? { "--cpw": `${pw}px` } : {}) } as React.CSSProperties}>

        <Resizer edge="right" label="Comment list width" className="rz-list" style={{ left: geo.l }} width={() => lRef.current?.offsetWidth ?? 340}
          min={260} max={() => Math.max(260, geo.w - (geo.pDocked ? geo.p + 12 : 0) - 12 - 380)} onResize={setLw} onReset={() => setLw(null)} />
        {geo.pDocked && <Resizer edge="left" label="Person panel width" className="rz-det" style={{ right: geo.p }} width={() => pRef.current?.offsetWidth ?? 300}
          min={250} max={() => Math.max(250, Math.min(480, geo.w - geo.l - 24 - 380))} onResize={setPw} onReset={() => setPw(null)} />}

        {/* ── list ── */}
        <section ref={lRef} className="card cl" aria-label="Comments">
          <div className="lhead">
            <div className="chips">
              {FILTERS.map(([k, label]) => (
                <button key={k} className={`chip${filter === k ? " on" : ""}${k === "needs" ? " hot" : ""}`} onClick={() => pick(k)} data-testid={`cf-${k}`}>
                  {label}{counts[k] > 0 && <span className="n">{counts[k]}</span>}
                </button>
              ))}
            </div>
            {mediaF && (
              <div className="pfilter" data-testid="post-filter">
                {fm?.thumb ? <img src={fm.thumb} alt="" /> : <span className="ph"><Icon name="image" size="xs" /></span>}
                <span className="grow trunc">{fm?.caption ? fm.caption : "Comments on this post"}</span>
                <button className="btn btn-ghost btn-icon btn-sm" onClick={clearMedia} aria-label="Show all posts"><Icon name="x" /></button>
              </div>
            )}
            <label className="search"><Icon name="magnifying-glass" size="sm" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search comments or people" aria-label="Search comments" /></label>
          </div>
          <div className="clist2">
            {list === null && Array.from({ length: 6 }).map((_, i) => <div key={i} className="skrow"><span className="sk av" /><span className="grow col gap-6"><span className="sk" style={{ height: 10, width: "40%" }} /><span className="sk" style={{ height: 10, width: "85%" }} /></span></div>)}
            {list !== null && shown.length === 0 && (
              <div className="empty" style={{ padding: "36px 18px" }}><div className="art"><Icon name={filter === "needs" ? "check-circle" : "chat-teardrop-text"} /></div>
                <h3>{filter === "needs" ? "All caught up" : "No comments here"}</h3>
                <p>{filter === "needs" ? "Every comment has an answer. New ones that no rule handles will appear here." : "Try another filter."}</p></div>
            )}
            {shown.map((x) => {
              const m = x.media_id ? media[x.media_id] : null;
              return (
                <button key={x.id} className={`cmt${sel === x.id ? " on" : ""}${x.state === "needs" ? " needs" : ""}`} onClick={() => void open(x.id)} data-testid="crow-comment">
                  <span className={`av ${avatarClass(x.from_id ?? x.id)}`}>{ini(x.from_name)}</span>
                  <span className="body">
                    <span className="l1"><b className="nm">{handle(x.from_name)}</b><span className="tm">{ago(x.created_at)}</span></span>
                    <span className="tx">{x.text ?? "(no text)"}</span>
                    <Badges c={x} />
                  </span>
                  {m?.thumb ? <img className="mini" src={m.thumb} alt="" /> : <span className="mini ph"><Icon name="image" size="xs" /></span>}
                </button>
              );
            })}
          </div>
        </section>

        {/* ── post + conversation ── */}
        <section className="card cm" aria-label="Comment">
          {!c ? (
            <div className="empty" style={{ margin: "auto" }}><div className="art"><Icon name="chat-teardrop-text" /></div><h3>Pick a comment</h3><p>See it on its post with the whole conversation, then reply publicly or by DM.</p></div>
          ) : (
            <>
              <div className="thead">
                <button className="btn btn-ghost btn-icon back" onClick={() => setView("list")} aria-label="Back to comments"><Icon name="arrow-left" /></button>
                <span className={`av ${avatarClass(c.from_id ?? c.id)}`}>{ini(c.from_name)}</span>
                <div className="who"><b>{handle(c.from_name)}</b><small>Commented {when(c.created_at)}</small></div>
                {c.state === "needs"
                  ? <button className="btn btn-ghost btn-sm" onClick={() => void dismiss()} data-testid="dismiss"><Icon name="check" />Dismiss</button>
                  : c.state === "dismissed" ? <button className="btn btn-ghost btn-sm" onClick={() => void dismiss(true)}>Undo dismiss</button> : null}
              </div>
              <div className="cstream">
                <article className="postcard">
                  <div className="pimg">{pm?.thumb ? <img src={pm.thumb} alt="" /> : <span className="ph"><Icon name={pm?.type === "VIDEO" ? "play" : "image"} /></span>}</div>
                  <div className="pmeta">
                    <span className="eyebrow">Post</span>
                    <p className="cap">{pm?.caption ?? (c.media_id ? "Instagram post" : "Comment")}</p>
                    <div className="row gap-6 wrap">
                      {pm?.permalink && <a className="btn btn-soft btn-sm" href={pm.permalink} target="_blank" rel="noreferrer"><Icon name="arrow-square-out" />Open on Instagram</a>}
                      {c.media_id && mediaF !== c.media_id && <button className="btn btn-ghost btn-sm" onClick={() => { setMediaF(c.media_id); setFilter("all"); void load("all", c.media_id); }}><Icon name="funnel" />Only this post</button>}
                    </div>
                  </div>
                </article>
                <div className="thread-h"><span className="eyebrow">{d!.onPost.length} comment{d!.onPost.length === 1 ? "" : "s"} on this post</span></div>
                {d!.onPost.map((x) => (
                  <div key={x.id} className={`ig-c${x.id === c.id ? " on" : ""}`} onClick={() => x.id !== c.id && void open(x.id)} role={x.id !== c.id ? "button" : undefined}>
                    <span className={`av sm ${avatarClass(x.from_id ?? x.id)}`}>{ini(x.from_name)}</span>
                    <div className="grow">
                      <p><b>{handle(x.from_name)}</b> {x.text}</p>
                      <span className="meta">{ago(x.created_at)}{x.state === "needs" && <span className="cb needs" style={{ marginLeft: 6 }}><span className="d" />Needs reply</span>}</span>
                      {x.public_status === "sent" && x.rule_public && <div className="ig-r"><span className="av xs me">{ini(username)}</span><p><b>{handle(username)}</b> {x.rule_public}</p><span className="tagx auto"><Icon name="lightning" size="xs" />Auto · {x.rule_name}</span></div>}
                      {x.dm_status === "sent" && x.reply_kind !== "private" && x.rule_reply && <div className="ig-r dm"><Icon name="paper-plane-tilt" size="sm" /><p>Private DM: “{x.rule_reply}”</p><span className="tagx auto"><Icon name="lightning" size="xs" />Auto · {x.rule_name}</span></div>}
                      {x.reply_text && x.reply_kind === "public" && <div className="ig-r"><span className="av xs me">{ini(username)}</span><p><b>{handle(username)}</b> {x.reply_text}</p><span className="tagx you"><Icon name="check" size="xs" />You · {x.replied_at ? ago(x.replied_at) : ""}</span></div>}
                      {x.reply_text && x.reply_kind === "private" && <div className="ig-r dm"><Icon name="paper-plane-tilt" size="sm" /><p>Private DM: “{x.reply_text}”</p><span className="tagx you"><Icon name="check" size="xs" />You · {x.replied_at ? ago(x.replied_at) : ""}</span></div>}
                    </div>
                  </div>
                ))}
              </div>
              <div className="ccomposer">
                <div className="seg" role="tablist" aria-label="Reply type">
                  <button role="tab" aria-selected={kind === "public"} className={kind === "public" ? "on" : ""} onClick={() => setKind("public")} data-testid="kind-public"><Icon name="chat-circle-dots" size="sm" />Public reply</button>
                  <button role="tab" aria-selected={kind === "private"} className={kind === "private" ? "on" : ""} onClick={() => setKind("private")} disabled={pUsed || pExp} data-testid="kind-private"
                    title={pUsed ? "Instagram allows one private reply per comment" : pExp ? "Private replies close 7 days after the comment" : ""}><Icon name="paper-plane-tilt" size="sm" />Private DM</button>
                  <span className="hint">{kind === "public" ? "Everyone can see it under the comment" : pUsed ? "Already used for this comment" : "Opens a DM chat · one per comment, within 7 days"}</span>
                </div>
                {ruleSuggestion && <button className="sugg" onClick={() => { setText(ruleSuggestion); taRef.current?.focus(); }}><Icon name="lightning" size="xs" />Use “{c.rule_name}” reply</button>}
                <div className="crow2">
                  <textarea ref={taRef} className="textarea" rows={2} value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} data-testid="comment-reply"
                    placeholder={kind === "public" ? `Reply to ${handle(c.from_name)} publicly…` : `Message ${handle(c.from_name)} privately…`}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} />
                  <button className="btn btn-primary" disabled={busy || !text.trim()} onClick={() => void send()} data-testid="comment-send"><Icon name="paper-plane-right" />{busy ? "Sending…" : "Send"}</button>
                </div>
                {note && <div className={`note ${note.kind === "ok" ? "ok" : "bad"}`} style={{ marginTop: 8 }} role="status"><Icon name={note.kind === "ok" ? "check-circle" : "warning-circle"} /><span>{note.text}</span></div>}
              </div>
            </>
          )}
        </section>

        {/* ── person ── */}
        <aside ref={pRef} className="card cp" aria-label="Person">
          {c && d ? (
            <>
              <div className="cp-h">
                <span className={`av xl ${avatarClass(c.from_id ?? c.id)}`}>{ini(c.from_name)}</span>
                <b>{handle(c.from_name)}</b>
                <small>{d.person.comments} comment{d.person.comments === 1 ? "" : "s"} since {new Date(d.person.since).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</small>
                <div className="row gap-6" style={{ marginTop: 10 }}>
                  {d.thread ? <a className="btn btn-soft btn-sm" href="/inbox?ch=ig"><Icon name="paper-plane-tilt" />Open DM</a> : <span className="pill neutral sm">No DM yet</span>}
                  {c.from_name && <a className="btn btn-ghost btn-sm" href={`https://www.instagram.com/${c.from_name.replace(/^@/, "")}/`} target="_blank" rel="noreferrer"><Icon name="arrow-square-out" />Profile</a>}
                </div>
              </div>
              <div className="cp-b">
                <div className="eyebrow">What happened</div>
                <ol className="tl2">
                  <li><span className="k pink"><Icon name="chat-circle-dots" size="xs" /></span><span><b>Commented</b><small>{when(c.created_at)}</small></span></li>
                  {c.rule_name
                    ? <li><span className="k grape"><Icon name="lightning" size="xs" /></span><span><b>Rule “{c.rule_name}” matched</b><small>Keyword auto-reply</small></span></li>
                    : <li><span className="k"><Icon name="prohibit" size="xs" /></span><span><b>No rule matched</b><small>Waiting for a person</small></span></li>}
                  {c.dm_status === "sent" && c.reply_kind !== "private" && <li><span className="k green"><Icon name="paper-plane-tilt" size="xs" /></span><span><b>Private DM sent</b><small>Automatically</small></span></li>}
                  {c.dm_status === "failed" && <li><span className="k red"><Icon name="warning" size="xs" /></span><span><b>Private DM failed</b><small>Reply by hand</small></span></li>}
                  {c.public_status === "sent" && <li><span className="k green"><Icon name="chat-circle-dots" size="xs" /></span><span><b>Public reply posted</b><small>Automatically</small></span></li>}
                  {c.replied_at && <li><span className="k green"><Icon name="check" size="xs" /></span><span><b>{c.reply_kind === "private" ? "You sent a private DM" : "You replied publicly"}</b><small>{when(c.replied_at)}</small></span></li>}
                  {c.hidden_at && !c.replied_at && <li><span className="k"><Icon name="check" size="xs" /></span><span><b>Dismissed</b><small>{when(c.hidden_at)}</small></span></li>}
                </ol>
                <div className="note info" style={{ fontSize: "var(--fs-xs)" }}><Icon name="lightbulb" /><span>Comments asking the same thing? <a href="/automation" style={{ textDecoration: "underline", fontWeight: 700 }}>Add a keyword rule</a> with “Instagram comment” on and it answers for you.</span></div>
              </div>
            </>
          ) : <div className="empty" style={{ margin: "auto" }}><p>The person behind a comment shows here.</p></div>}
        </aside>

        <section className="zero" aria-label="No comments yet">
          <div className="empty" style={{ maxWidth: 420 }}>
            <div className="art"><Icon name="chat-teardrop-text" /></div>
            <h3>No comments yet</h3>
            <p>When people comment on {username ? `@${username.replace(/^@/, "")}` : "your"} posts, they appear here within seconds. Keyword rules can answer them automatically.</p>
            <div className="acts"><a className="btn btn-primary" href="/automation"><Icon name="lightning" />Set up comment auto-replies</a></div>
          </div>
        </section>
      </div>
    </div>
  );
}
