"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { aiStatus, setAiContext, useAiHandler } from "@/lib/ai-bridge";

/**
 * NextBiz Ads · Create — a real Meta ad builder. One page, six plain steps, live preview:
 *  1 goal (WhatsApp chats · Instagram DMs · website) → 2 who it's from (Page + Instagram) →
 *  3 audience (Meta's own location search with radius, age, gender, interests, live audience size) →
 *  4 placements (Advantage+ or pick Facebook / Instagram / Messenger spots) → 5 format + media upload →
 *  6 text, budget, schedule. Publishing creates everything on Meta PAUSED — it spends only after "Resume".
 * Without an ad account it still works as a planner (demo locations, drafts only).
 */
type Goal = "whatsapp" | "instagram_dm" | "website";
type Loc = { key: string; name: string; type: string; region?: string; country_code?: string; country_name?: string; radiusKm?: number };
type Interest = { id: string; name: string; audience_size_upper_bound?: number; path?: string[] };
type Ident = { connected: boolean; account?: { id: string; name: string | null }; pages: { id: string; name: string; whatsapp?: boolean | null }[]; instagram: { id: string; username: string }[]; pageError: string | null };
type Media = { kind: "image"; hash: string | null; preview: string; uploading: boolean; error?: string } | { kind: "video"; id: string | null; preview: string; thumb: string | null; ready: boolean; uploading: boolean; error?: string };

const GOALS: [Goal, string, string, string, string][] = [
  ["whatsapp", "WhatsApp chats", "Tapping the ad opens a WhatsApp chat with you — it lands in your inbox.", "whatsapp-logo", "green"],
  ["instagram_dm", "Instagram DMs", "Tapping the ad opens a DM with your Instagram account.", "instagram-logo", "pink"],
  ["website", "Website visits", "Send people to a page on your website.", "globe", "grape"],
];
const PLACES: { group: string; icon: string; items: [string, string][] }[] = [
  { group: "Facebook", icon: "facebook-logo", items: [["facebook:feed", "Feed"], ["facebook:story", "Stories"], ["facebook:facebook_reels", "Reels"], ["facebook:video_feeds", "Video feeds"], ["facebook:marketplace", "Marketplace"]] },
  { group: "Instagram", icon: "instagram-logo", items: [["instagram:stream", "Feed"], ["instagram:story", "Stories"], ["instagram:reels", "Reels"], ["instagram:explore", "Explore"]] },
  { group: "Messenger", icon: "chat-circle-dots", items: [["messenger:messenger_home", "Inbox"], ["messenger:story", "Stories"]] },
];
const WEB_CTA: [string, string][] = [["LEARN_MORE", "Learn more"], ["SHOP_NOW", "Shop now"], ["ORDER_NOW", "Order now"], ["BOOK_NOW", "Book now"], ["GET_QUOTE", "Get quote"], ["CONTACT_US", "Contact us"],
  ["SIGN_UP", "Sign up"], ["APPLY_NOW", "Apply now"], ["GET_OFFER", "Get offer"], ["SUBSCRIBE", "Subscribe"], ["SEE_MENU", "See menu"], ["DOWNLOAD", "Download"], ["WATCH_MORE", "Watch more"]];
const META_FMTS: [string, string, Goal[] | null][] = [["INSTAGRAM_STANDARD", "Instagram feed", null], ["INSTAGRAM_STORY", "Instagram Story", null], ["MOBILE_FEED_STANDARD", "Facebook feed", null],
  ["FACEBOOK_STORY_MOBILE", "Facebook Story", null], ["INSTAGRAM_REELS", "Instagram Reels", null], ["FACEBOOK_REELS_MOBILE", "Facebook Reels", null]];
const TYPE_LABEL: Record<string, string> = { country: "Country", region: "State", city: "City", zip: "PIN code" };
const RADII = [10, 15, 25, 40, 50, 80];
const AGES = Array.from({ length: 48 }, (_, i) => i + 18);
const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
const big = (n: number) => n >= 1e7 ? `${(n / 1e7).toFixed(1)} Cr` : n >= 1e5 ? `${(n / 1e5).toFixed(1)} L` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n);

function useDebounced<T>(v: T, ms = 300) { const [d, setD] = useState(v); useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]); return d; }

function Search<T extends { key?: string; id?: string; name: string }>({ placeholder, url, onPick, render, testId, disabledHint }: {
  placeholder: string; url: string; onPick: (x: T) => void; render: (x: T) => React.ReactNode; testId: string; disabledHint?: string | null;
}) {
  const [q, setQ] = useState(""); const dq = useDebounced(q);
  const [hits, setHits] = useState<T[]>([]); const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (dq.trim().length < 2) { setHits([]); return; }
    let live = true; setBusy(true);
    fetch(`${url}?q=${encodeURIComponent(dq.trim())}`, { cache: "no-store" }).then((r) => r.json()).then((d) => { if (live) setHits((d?.locations ?? d?.interests ?? []) as T[]); })
      .catch(() => {}).finally(() => live && setBusy(false));
    return () => { live = false; };
  }, [dq, url]);
  return (
    <div className="picker" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false); }}>
      <label className="search"><Icon name="magnifying-glass" size="sm" /><input value={q} placeholder={placeholder} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} data-testid={testId} aria-label={placeholder} />{busy && <span className="spin-dot" />}</label>
      {open && q.trim().length >= 2 && (
        <div className="pop" role="listbox">
          {hits.length === 0 && !busy && <div className="pop-empty">{disabledHint ?? "No matches — try another spelling."}</div>}
          {hits.map((h) => <button key={h.key ?? h.id} type="button" className="pop-row" role="option" aria-selected={false} onClick={() => { onPick(h); setQ(""); setOpen(false); }} data-testid={`${testId}-opt`}>{render(h)}</button>)}
        </div>
      )}
    </div>
  );
}

export function NewCampaignClient() {
  const router = useRouter();
  const [ident, setIdent] = useState<Ident | null>(null);
  const [name, setName] = useState("");
  const [goal, setGoal] = useState<Goal>("whatsapp");
  const [pageId, setPageId] = useState("");
  const [igId, setIgId] = useState("");
  const [locs, setLocs] = useState<Loc[]>([]);
  const [ageMin, setAgeMin] = useState(21);
  const [ageMax, setAgeMax] = useState(55);
  const [genders, setGenders] = useState<"all" | "men" | "women">("all");
  const [interests, setInterests] = useState<Interest[]>([]);
  const [advantage, setAdvantage] = useState(false);
  const [placeMode, setPlaceMode] = useState<"auto" | "manual">("auto");
  const [places, setPlaces] = useState<string[]>(["facebook:feed", "instagram:stream", "instagram:story", "instagram:reels"]);
  const [format, setFormat] = useState<"image" | "video">("image");
  const [media, setMedia] = useState<Media | null>(null);
  const [primary, setPrimary] = useState("");
  const [headline, setHeadline] = useState("");
  const [desc, setDesc] = useState("");
  const [url, setUrl] = useState("");
  const [cta, setCta] = useState("LEARN_MORE");
  const [msgCta, setMsgCta] = useState("");          // "" = Meta's default chat button
  const [greeting, setGreeting] = useState("Hi! 👋 Thanks for reaching out. How can we help you today?");
  const [startMode, setStartMode] = useState<"autofill" | "questions">("autofill");
  const [autofill, setAutofill] = useState("Hi! I'd like to know more about this.");
  const [questions, setQuestions] = useState<string[]>(["What's the price?", "Do you deliver to my area?", ""]);
  const [extra, setExtra] = useState<"none" | "call" | "url">("none");
  const [extraUrl, setExtraUrl] = useState("");
  const [pvMode, setPvMode] = useState<"meta" | "sketch" | "chat">("meta");
  const [metaFmt, setMetaFmt] = useState("INSTAGRAM_STANDARD");
  const [metaPv, setMetaPv] = useState<{ src: string; width: number; height: number } | null>(null);
  const [metaPvErr, setMetaPvErr] = useState("");
  const [metaPvBusy, setMetaPvBusy] = useState(false);
  const [budget, setBudget] = useState(500);
  const [start, setStart] = useState("");
  const [stop, setStop] = useState("");
  const [estimate, setEstimate] = useState<{ lower: number; upper: number } | null>(null);
  const [view, setView] = useState<"fb" | "ig" | "story">("ig");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState<"" | "draft" | "publish">("");
  const fileRef = useRef<HTMLInputElement>(null);
  const live = !!ident?.connected;
  // NextBiz AI copilot
  const [aiOn, setAiOn] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);
  const [flash, setFlash] = useState<Set<string>>(new Set());
  useEffect(() => { void aiStatus().then((s) => setAiOn(s.available)); }, []);
  const applyFields = useCallback((f: Record<string, unknown>) => {
    const changed = new Set<string>();
    const s = (k: string, fn: () => void) => { if (f[k] !== undefined && f[k] !== null && f[k] !== "") { fn(); changed.add(k); } };
    s("name", () => setName(String(f.name).slice(0, 100)));
    s("goal", () => { if (["whatsapp", "instagram_dm", "website"].includes(String(f.goal))) setGoal(f.goal as Goal); });
    s("locations", () => { const ls = (f.locations as Loc[]).filter((l) => l?.key && l?.name).map((l) => ({ ...l, radiusKm: l.type === "city" ? Math.min(80, Math.max(10, Number(l.radiusKm) || 25)) : undefined })); if (ls.length) setLocs(ls); });
    s("ageMin", () => setAgeMin(Math.min(65, Math.max(18, Number(f.ageMin)))));
    s("ageMax", () => setAgeMax(Math.min(65, Math.max(18, Number(f.ageMax)))));
    s("genders", () => { if (["all", "men", "women"].includes(String(f.genders))) setGenders(f.genders as "all"); });
    s("interests", () => setInterests((f.interests as Interest[]).filter((i) => i?.id && i?.name)));
    s("primaryText", () => setPrimary(String(f.primaryText).slice(0, 2200)));
    s("headline", () => setHeadline(String(f.headline).slice(0, 255)));
    s("description", () => setDesc(String(f.description).slice(0, 255)));
    s("websiteUrl", () => setUrl(String(f.websiteUrl)));
    s("dailyBudget", () => setBudget(Math.max(100, Math.round(Number(f.dailyBudget) || 100))));
    setFlash(changed); setTimeout(() => setFlash(new Set()), 4000);
    return changed.size;
  }, []);
  useAiHandler("campaign_form", useCallback((p: Record<string, unknown>) => {
    const n = applyFields(p); setAiNote({ kind: "ok", text: `NextBiz AI filled ${n} field${n === 1 ? "" : "s"} — review everything, then publish yourself.` });
  }, [applyFields]));
  async function aiFill() {
    if (aiPrompt.trim().length < 3) return;
    setAiBusy(true); setAiNote(null);
    const d = await fetch("/api/ai/campaign-fill", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: aiPrompt, current: { name, goal, locations: locs.map((l) => l.name), ageMin, ageMax, dailyBudget: budget, headline, primaryText: primary } }) }).then((r) => r.json()).catch(() => null);
    setAiBusy(false);
    if (!d?.ok) { setAiNote({ kind: "bad", text: d?.error ?? "The AI couldn't fill the form." }); return; }
    const n = applyFields(d.fields ?? {});
    setAiNote({ kind: "ok", text: `${d.summary ? `${d.summary} — ` : ""}filled ${n} field${n === 1 ? "" : "s"} (highlighted). Add your image or video, check everything, then publish.` });
  }

  useEffect(() => {
    fetch("/api/ads/identities", { cache: "no-store" }).then((r) => r.json()).then((d: Ident) => {
      setIdent(d);
      if (d.pages?.length === 1) setPageId(d.pages[0].id);
      if (d.instagram?.length === 1) setIgId(d.instagram[0].id);
    }).catch(() => setIdent({ connected: false, pages: [], instagram: [], pageError: null }));
  }, []);

  // live audience size from Meta (debounced)
  const targeting = useMemo(() => ({ goal, locations: locs.map((l) => ({ key: l.key, type: l.type, name: l.name, radiusKm: l.type === "city" ? l.radiusKm ?? 25 : undefined })),
    ageMin, ageMax, genders, interests: interests.map((i) => ({ id: i.id, name: i.name })), advantageAudience: advantage,
    placements: placeMode === "auto" ? "auto" as const : places }), [goal, locs, ageMin, ageMax, genders, interests, advantage, placeMode, places]);
  const dTargeting = useDebounced(targeting, 600);
  useEffect(() => {
    if (!live || dTargeting.locations.length === 0) { setEstimate(null); return; }
    let ok = true;
    fetch("/api/ads/estimate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(dTargeting) }).then((r) => r.json()).then((d) => { if (ok) setEstimate(d?.estimate ?? null); }).catch(() => {});
    return () => { ok = false; };
  }, [dTargeting, live]);

  // video processing poll
  useEffect(() => {
    if (media?.kind !== "video" || !media.id || media.ready) return;
    const t = setInterval(async () => {
      const d = await fetch(`/api/ads/media/video/${media.id}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
      if (d?.ok) setMedia((m) => m && m.kind === "video" ? { ...m, ready: d.ready, thumb: d.thumb ?? m.thumb, error: d.error ?? undefined } : m);
    }, 4000);
    return () => clearInterval(t);
  }, [media]);

  const pickFile = useCallback(async (f: File) => {
    const isVid = f.type.startsWith("video/");
    if (isVid !== (format === "video")) { setErr(format === "video" ? "Choose a video file (MP4 or MOV)." : "Choose an image file (JPG or PNG)."); return; }
    setErr("");
    const preview = URL.createObjectURL(f);
    setMedia(isVid ? { kind: "video", id: null, preview, thumb: null, ready: false, uploading: live } : { kind: "image", hash: null, preview, uploading: live });
    if (!live) return; // planner mode: preview only
    const fd = new FormData(); fd.set("file", f);
    const d = await fetch("/api/ads/media", { method: "POST", body: fd }).then((r) => r.json()).catch(() => ({ error: "Upload failed — check your connection." }));
    if (!d?.ok) { setMedia((m) => m ? { ...m, uploading: false, error: d?.error ?? "Upload failed" } as Media : m); return; }
    setMedia((m) => !m ? m : m.kind === "image" ? { ...m, hash: d.hash, uploading: false } : { ...m, id: d.id, uploading: false });
  }, [format, live]);

  useEffect(() => {
    setAiContext({ page: "campaign", title: "the campaign builder", entity: { form: { name, goal, locations: locs.map((l) => `${l.name}${l.type === "city" ? ` +${l.radiusKm ?? 25}km` : ""}`), ageMin, ageMax, genders,
      interests: interests.map((i) => i.name), placements: placeMode === "auto" ? "Advantage+" : places, format, mediaUploaded: !!media, primaryText: primary, headline, dailyBudget: budget }, adAccountConnected: live } });
    return () => setAiContext(null);
  }, [name, goal, locs, ageMin, ageMax, genders, interests, placeMode, places, format, media, primary, headline, budget, live]);

  const igNeeded = goal === "instagram_dm" || placeMode === "auto" || places.some((p) => p.startsWith("instagram:"));
  const checks: [boolean, string][] = [
    [!!name.trim(), "Campaign named"],
    [!!pageId, "Facebook Page chosen"],
    [!igNeeded || !!igId, "Instagram account chosen"],
    [locs.length > 0, "At least one location"],
    [!!media && (media.kind === "image" ? !!media.hash : !!media.id && media.ready), "Image or video uploaded"],
    [!!primary.trim() && !!headline.trim(), "Text and headline written"],
    [goal !== "website" || /^https?:\/\/\S+\.\S+/.test(url), "Website address added"],
    [budget >= 100, "Budget ₹100/day or more"],
    [goal !== "whatsapp" || ident?.pages.find((p) => p.id === pageId)?.whatsapp !== false, "Page linked to WhatsApp"],
  ];
  const ready = live && checks.every(([ok]) => ok) && !ident?.pageError;

  function welcome() {
    if (goal === "website" || !greeting.trim()) return null;
    return { greeting: greeting.trim(), mode: startMode, autofill: autofill.trim() || null, questions: questions.map((q) => q.trim()).filter(Boolean),
      extra: goal === "whatsapp" ? extra : "none", extraUrl: goal === "whatsapp" && extra === "url" && /^https?:\/\/\S+\.\S+/.test(extraUrl) ? extraUrl.trim() : null };
  }
  function spec() {
    return {
      name: name.trim(), pageId, instagramId: igId || null, ...targeting,
      format, imageHash: media?.kind === "image" ? media.hash : null, videoId: media?.kind === "video" ? media.id : null, videoThumb: media?.kind === "video" ? media.thumb : null,
      primaryText: primary.trim(), headline: headline.trim(), description: desc.trim() || null,
      websiteUrl: goal === "website" ? url.trim() : null, cta: goal === "website" ? cta : msgCta || null, welcome: welcome(),
      dailyBudget: Math.round(budget), startTime: start ? new Date(start).toISOString() : null, endTime: stop ? new Date(stop).toISOString() : null,
    };
  }
  async function submit(publish: boolean) {
    if (!name.trim()) { setErr("Give your campaign a name."); return; }
    if (budget < 100) { setErr("Daily budget must be at least ₹100."); return; }
    if (stop && start && new Date(stop) <= new Date(start)) { setErr("End must be after the start."); return; }
    if (publish && !ready) { setErr(live ? `Before publishing: ${checks.filter(([ok]) => !ok).map(([, t]) => t.toLowerCase()).join(", ")}${ident?.pageError ? ` — ${ident.pageError}` : ""}.` : "Connect an ad account to publish."); return; }
    setErr(""); setBusy(publish ? "publish" : "draft");
    const d = await fetch("/api/ads/publish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ spec: spec(), publish }) }).then((r) => r.json()).catch(() => null);
    setBusy("");
    if (!d?.ok) { setErr(d?.error ?? "Couldn't save the campaign."); return; }
    router.push(publish ? "/ads?status=PAUSED" : "/ads?status=DRAFT");
  }

  // Meta's own preview (exact) — refetched shortly after the creative changes
  const mediaReady = !!media && (media.kind === "image" ? !!media.hash : !!media.id && media.ready);
  const canMetaPv = live && !!pageId && mediaReady;
  const pvKey = JSON.stringify([canMetaPv, metaFmt, goal, pageId, igId, media?.kind === "image" ? media.hash : media?.kind === "video" ? media.id : null, primary, headline, desc, url, cta, msgCta, greeting, startMode, autofill, questions, extra]);
  const dPvKey = useDebounced(pvKey, 900);
  useEffect(() => {
    if (!canMetaPv || pvMode !== "meta") return;
    let alive = true; setMetaPvBusy(true); setMetaPvErr("");
    fetch("/api/ads/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      format: metaFmt, goal, pageId, instagramId: igId || null, kind: media!.kind, imageHash: media?.kind === "image" ? media.hash : null,
      videoId: media?.kind === "video" ? media.id : null, videoThumb: media?.kind === "video" ? media.thumb : null, primaryText: primary, headline, description: desc || null,
      websiteUrl: goal === "website" && /^https?:\/\/\S+\.\S+/.test(url) ? url : null, cta: goal === "website" ? cta : msgCta || null, welcome: welcome(),
    }) }).then((r) => r.json()).then((d) => { if (!alive) return; if (d?.ok) setMetaPv({ src: d.src, width: d.width, height: d.height }); else { setMetaPv(null); setMetaPvErr(d?.error ?? "Meta couldn't build a preview."); } })
      .catch(() => alive && setMetaPvErr("Couldn't reach Meta for the preview.")).finally(() => alive && setMetaPvBusy(false));
    return () => { alive = false; };
  }, [dPvKey, pvMode]);
  const pageName = ident?.pages.find((p) => p.id === pageId)?.name ?? "Your Page";
  const igName = ident?.instagram.find((p) => p.id === igId)?.username ?? "your.business";
  const msgDefault = goal === "whatsapp" ? "Send WhatsApp message" : "Send message";
  const ctaLabel = goal === "website" ? WEB_CTA.find(([k]) => k === cta)?.[1] ?? "Learn more" : msgCta ? WEB_CTA.find(([k]) => k === msgCta)?.[1] ?? msgDefault : msgDefault;
  const selPage = ident?.pages.find((p) => p.id === pageId);
  const mediaSrc = media ? (media.kind === "video" ? media.thumb ?? null : media.preview) : null;

  return (
    <div className="pg-ads-create">
      <div className="cw" data-testid="ads-wizard">
        <div className="form">
          {aiOn && (
            <section className="card ai-fill" data-testid="ai-fill">
              <div className="ai-fill-h"><span className="ai-logo sm"><Icon name="sparkle" /></span><span className="grow"><b>Describe your ad — AI fills the form</b><small>e.g. “₹500 a day, women 25–45 within 20 km of Kolkata, Diwali cheesecakes, people should message on WhatsApp”</small></span></div>
              <div className="ai-fill-b">
                <textarea className="textarea" rows={2} value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value.slice(0, 2000))} placeholder="Who, where, budget, what you're selling…" data-testid="ai-fill-input"
                  onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void aiFill(); } }} />
                <button className="btn btn-primary" disabled={aiBusy || aiPrompt.trim().length < 3} onClick={() => void aiFill()} data-testid="ai-fill-go"><Icon name="sparkle" />{aiBusy ? "Filling…" : "Fill with AI"}</button>
              </div>
              {aiNote && <div className={`note ${aiNote.kind === "ok" ? "info" : "bad"}`} style={{ margin: "0 var(--pad) var(--pad)" }}><Icon name={aiNote.kind === "ok" ? "check-circle" : "warning-circle"} /><span>{aiNote.text}</span></div>}
            </section>
          )}
          {!live && ident && <div className="note warn"><Icon name="info" /><span><b>Planner mode.</b> No ad account is connected, so you can plan and save drafts but not publish. <a href="/connections#ads" style={{ textDecoration: "underline", fontWeight: 700 }}>Connect an ad account</a></span></div>}

          {/* 1 goal */}
          <section className="card">
            <div className="sec-h"><span className="k">1</span><span className="grow"><b>What should people do?</b><small>This sets where your ad sends people.</small></span></div>
            <div className="sec-b">
              <div className={`field${flash.has("name") ? " ai-flash" : ""}`}><label htmlFor="f-name">Campaign name <span className="opt">only you see this</span></label><input id="f-name" className="input" value={name} onChange={(e) => setName(e.target.value.slice(0, 100))} placeholder="Diwali cakes — Kolkata" data-testid="f-name" /></div>
              <div className={`goals g3${flash.has("goal") ? " ai-flash" : ""}`}>
                {GOALS.map(([k, t, s, ic, tone]) => (
                  <div key={k} className={`goal${goal === k ? " on" : ""}`} onClick={() => setGoal(k)} role="radio" aria-checked={goal === k} tabIndex={0} data-testid={`obj-${k}`}>
                    <span className={`icon-tile ${goal === k ? tone : "neutral"}`}><Icon name={ic} /></span><b>{t}</b><small>{s}</small>
                  </div>
                ))}
              </div>
              {goal === "whatsapp" && (selPage?.whatsapp === false
                ? <div className="note warn" data-testid="wa-unlinked"><Icon name="warning" /><span><b>One more step on Facebook: link {selPage.name} to your WhatsApp number.</b> Your WhatsApp Business number is connected to NextBiz, but Meta also needs the <i>Facebook Page</i> linked to it before it runs click-to-WhatsApp ads (Meta told us this when we tried). On Facebook open {selPage.name} → <b>Settings → Linked accounts → WhatsApp</b>, enter your business number and confirm the code. <a className="btn-link" href="https://www.facebook.com/settings/?tab=linked_whatsapp" target="_blank" rel="noreferrer">Open Linked accounts ↗</a> (switch into the Page first) Until then, choose Instagram DMs or Website visits.</span></div>
                : <span className="hint"><Icon name="info" size="xs" /> Meta needs your Facebook Page linked to your WhatsApp Business number (Page settings → Linked accounts → WhatsApp).</span>)}
              {goal !== "website" && (
                <>
                  <div className="g2">
                    <div className="field"><label htmlFor="f-mcta">Button on the ad</label>
                      <select id="f-mcta" className="select" value={msgCta} onChange={(e) => setMsgCta(e.target.value)} data-testid="f-mcta">
                        <option value="">{msgDefault} (recommended)</option>{WEB_CTA.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                      <span className="hint">Any label still opens the {goal === "whatsapp" ? "WhatsApp" : "Instagram"} chat.</span></div>
                  </div>
                  <div className="chatstart" data-testid="chat-start">
                    <div className="cs-h"><Icon name="chat-teardrop-text" /><span className="grow"><b>When the chat opens</b><small>What people see in {goal === "whatsapp" ? "WhatsApp" : "Instagram"} right after tapping your ad.</small></span></div>
                    <div className="field"><label htmlFor="f-greet">Your greeting <span className="opt">shown as a message from you</span></label>
                      <textarea id="f-greet" className="textarea" rows={2} value={greeting} onChange={(e) => setGreeting(e.target.value.slice(0, 300))} data-testid="f-greet" placeholder="Leave empty to use Meta's default" /></div>
                    <div className="field"><label>How the customer starts</label>
                      <div className="seg" style={{ alignSelf: "flex-start" }}>
                        <button type="button" className={startMode === "autofill" ? "on" : ""} onClick={() => setStartMode("autofill")} data-testid="start-autofill">A message typed for them</button>
                        <button type="button" className={startMode === "questions" ? "on" : ""} onClick={() => setStartMode("questions")} data-testid="start-questions">Quick questions to tap</button>
                      </div></div>
                    {startMode === "autofill"
                      ? <div className="field"><input className="input" value={autofill} onChange={(e) => setAutofill(e.target.value.slice(0, 300))} placeholder="Hi! I'd like to know more about this." aria-label="Message typed for the customer" data-testid="f-autofill" /><span className="hint">Already in their message box — they just press send. Easy first message = more chats.</span></div>
                      : <div className="col gap-6">{questions.map((q, i) => <input key={i} className="input" value={q} onChange={(e) => setQuestions(questions.map((x, k) => (k === i ? e.target.value.slice(0, 80) : x)))} placeholder={`Question ${i + 1}${i > 1 ? " (optional)" : ""}`} aria-label={`Quick question ${i + 1}`} />)}
                          {questions.length < 4 && <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => setQuestions([...questions, ""])}><Icon name="plus" />Add a question</button>}
                          <span className="hint">They tap one and it&apos;s sent as their first message.</span></div>}
                    {goal === "whatsapp" && (
                      <div className="field"><label>Button under your greeting <span className="opt">optional</span></label>
                        <div className="seg" style={{ alignSelf: "flex-start" }}>
                          {([["none", "None"], ["call", "Call us"], ["url", "Visit website"]] as const).map(([k, l]) => <button key={k} type="button" className={extra === k ? "on" : ""} onClick={() => setExtra(k)}>{l}</button>)}
                        </div>
                        {extra === "url" && <input className="input" value={extraUrl} onChange={(e) => setExtraUrl(e.target.value.trim())} placeholder="https://yourshop.in" aria-label="Website for the greeting button" />}
                      </div>
                    )}
                  </div>
                </>
              )}
              {goal === "website" && (
                <div className="g2">
                  <div className="field"><label htmlFor="f-url">Website address</label><input id="f-url" className="input" value={url} onChange={(e) => setUrl(e.target.value.trim())} placeholder="https://yourshop.in/offer" /></div>
                  <div className="field"><label htmlFor="f-cta">Button</label><select id="f-cta" className="select" value={cta} onChange={(e) => setCta(e.target.value)}>{WEB_CTA.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
                </div>
              )}
            </div>
          </section>

          {/* 2 identity */}
          <section className="card">
            <div className="sec-h"><span className="k">2</span><span className="grow"><b>Who is the ad from?</b><small>People see your Page or Instagram name on the ad.</small></span></div>
            <div className="sec-b">
              <div className="g2">
                <div className="field"><label htmlFor="f-page"><Icon name="facebook-logo" size="xs" /> Facebook Page</label>
                  <select id="f-page" className="select" value={pageId} onChange={(e) => setPageId(e.target.value)} disabled={!live} data-testid="f-page">
                    <option value="">{live ? (ident?.pages.length ? "Choose a Page" : "No Page found") : "Connect an ad account"}</option>
                    {ident?.pages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
                <div className="field"><label htmlFor="f-ig"><Icon name="instagram-logo" size="xs" /> Instagram account {!igNeeded && <span className="opt">optional</span>}</label>
                  <select id="f-ig" className="select" value={igId} onChange={(e) => setIgId(e.target.value)} disabled={!live} data-testid="f-ig">
                    <option value="">{live ? (ident?.instagram.length ? "Choose an account" : "No Instagram account found") : "Connect an ad account"}</option>
                    {ident?.instagram.map((p) => <option key={p.id} value={p.id}>@{p.username}</option>)}</select></div>
              </div>
              {ident?.pageError && <div className="note warn"><Icon name="warning" /><span>{ident.pageError}</span></div>}
            </div>
          </section>

          {/* 3 audience */}
          <section className="card">
            <div className="sec-h"><span className="k">3</span><span className="grow"><b>Who should see it?</b><small>Real places from Meta&apos;s map — a city with a radius, a state, a PIN code or a country.</small></span></div>
            <div className="sec-b">
              <div className={`field${flash.has("locations") ? " ai-flash" : ""}`}><label>Locations</label>
                <Search<Loc> placeholder="Search a city, state, PIN code or country" url="/api/ads/targeting/locations" testId="loc-search"
                  onPick={(l) => setLocs((xs) => xs.some((x) => x.key === l.key) ? xs : [...xs, { ...l, radiusKm: l.type === "city" ? 25 : undefined }])}
                  render={(l) => <><span className={`lt ${l.type}`}>{TYPE_LABEL[l.type] ?? l.type}</span><span className="grow"><b>{l.name}</b><small>{[l.region, l.country_name ?? l.country_code].filter(Boolean).join(", ")}</small></span><Icon name="plus" size="sm" /></>} />
                {locs.length > 0 && (
                  <div className="locs">
                    {locs.map((l) => (
                      <div key={l.key} className="loc" data-testid="loc-chip">
                        <Icon name="map-pin" size="sm" /><span className="grow"><b>{l.name}</b><small>{TYPE_LABEL[l.type] ?? l.type}{l.region ? ` · ${l.region}` : ""}</small></span>
                        {l.type === "city" && <select className="select sm" value={l.radiusKm ?? 25} onChange={(e) => setLocs((xs) => xs.map((x) => x.key === l.key ? { ...x, radiusKm: Number(e.target.value) } : x))} aria-label={`Radius around ${l.name}`}>
                          {RADII.map((r) => <option key={r} value={r}>+{r} km</option>)}</select>}
                        <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => setLocs((xs) => xs.filter((x) => x.key !== l.key))} aria-label={`Remove ${l.name}`}><Icon name="x" /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="g3f">
                <div className="field"><label htmlFor="f-amin">Age from</label><select id="f-amin" className="select" value={ageMin} onChange={(e) => setAgeMin(Number(e.target.value))}>{AGES.map((a) => <option key={a} value={a}>{a}</option>)}</select></div>
                <div className="field"><label htmlFor="f-amax">to</label><select id="f-amax" className="select" value={ageMax} onChange={(e) => setAgeMax(Number(e.target.value))}>{AGES.filter((a) => a >= ageMin).map((a) => <option key={a} value={a}>{a === 65 ? "65+" : a}</option>)}</select></div>
                <div className="field"><label>Gender</label><div className="seg">{(["all", "women", "men"] as const).map((g) => <button key={g} type="button" className={genders === g ? "on" : ""} onClick={() => setGenders(g)}>{g === "all" ? "Everyone" : g === "women" ? "Women" : "Men"}</button>)}</div></div>
              </div>
              <div className="field"><label>Interests <span className="opt">optional — leave empty to reach everyone in these places</span></label>
                <Search<Interest> placeholder={live ? "e.g. bakery, home decor, small business" : "Connect an ad account to search interests"} url="/api/ads/targeting/interests" testId="int-search"
                  disabledHint={live ? null : "Interest search needs a connected ad account."}
                  onPick={(i) => setInterests((xs) => xs.some((x) => x.id === i.id) ? xs : [...xs, i])}
                  render={(i) => <><span className="grow"><b>{i.name}</b><small>{i.path?.slice(0, -1).join(" › ") || "Interest"}</small></span>{i.audience_size_upper_bound ? <span className="xs faint">{big(i.audience_size_upper_bound)}</span> : null}<Icon name="plus" size="sm" /></>} />
                {interests.length > 0 && <div className="row wrap gap-6" style={{ marginTop: 8 }}>{interests.map((i) => <span key={i.id} className="tag ichip">{i.name}<span className="x" role="button" aria-label={`Remove ${i.name}`} onClick={() => setInterests((xs) => xs.filter((x) => x.id !== i.id))}>✕</span></span>)}</div>}
              </div>
              <div className="hrow adv"><span className="icon-tile sm grape"><Icon name="sparkle" /></span><span className="grow"><b>Advantage+ audience</b><small>Let Meta reach beyond these settings when it finds likely customers. Your locations always stay.</small></span>
                <button type="button" className={`tog${advantage ? " on" : ""}`} role="switch" aria-checked={advantage} aria-label="Advantage+ audience" onClick={() => setAdvantage((v) => !v)} /></div>
            </div>
          </section>

          {/* 4 placements */}
          <section className="card">
            <div className="sec-h"><span className="k">4</span><span className="grow"><b>Where should it appear?</b><small>WhatsApp is where people land — the ad itself shows on Facebook, Instagram and Messenger.</small></span></div>
            <div className="sec-b">
              <div className="pm">
                <div className={`pmo${placeMode === "auto" ? " on" : ""}`} onClick={() => setPlaceMode("auto")} role="radio" aria-checked={placeMode === "auto"} tabIndex={0} data-testid="place-auto">
                  <span className="dot" /><span className="grow"><b>Advantage+ placements <span className="pill sm ads nodot">Recommended</span></b><small>Meta shows the ad wherever it performs best — usually the cheapest results.</small></span></div>
                <div className={`pmo${placeMode === "manual" ? " on" : ""}`} onClick={() => setPlaceMode("manual")} role="radio" aria-checked={placeMode === "manual"} tabIndex={0} data-testid="place-manual">
                  <span className="dot" /><span className="grow"><b>Choose placements</b><small>Pick exactly where it shows.</small></span></div>
              </div>
              {placeMode === "manual" && (
                <div className="pgrid3">
                  {PLACES.map((g) => (
                    <div key={g.group} className="pg"><div className="pg-h"><Icon name={g.icon} size="sm" />{g.group}</div>
                      {g.items.map(([k, l]) => <label key={k} className="ck2"><input type="checkbox" checked={places.includes(k)} onChange={(e) => setPlaces((xs) => e.target.checked ? [...xs, k] : xs.filter((x) => x !== k))} data-testid={`pl-${k}`} />{l}</label>)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* 5 format + media */}
          <section className="card">
            <div className="sec-h"><span className="k">5</span><span className="grow"><b>Ad format &amp; media</b><small>Square 1080×1080 works everywhere; 1080×1920 looks best in Stories and Reels.</small></span></div>
            <div className="sec-b">
              <div className="seg" style={{ alignSelf: "flex-start" }}>
                <button type="button" className={format === "image" ? "on" : ""} onClick={() => { setFormat("image"); setMedia(null); }} data-testid="fmt-image"><Icon name="image" size="sm" /> Single image</button>
                <button type="button" className={format === "video" ? "on" : ""} onClick={() => { setFormat("video"); setMedia(null); }} data-testid="fmt-video"><Icon name="video-camera" size="sm" /> Single video</button>
              </div>
              <div className={`drop${media ? " has" : ""}`} onClick={() => fileRef.current?.click()} onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void pickFile(f); }} role="button" tabIndex={0} data-testid="media-drop">
                {media ? (
                  <>
                    {media.kind === "image" ? <img src={media.preview} alt="" /> : <video src={media.preview} muted playsInline controls />}
                    <div className="drop-st">
                      {media.uploading ? <><span className="spin-dot" />Uploading to your ad account…</>
                        : media.error ? <span style={{ color: "var(--danger-deep)" }}><Icon name="warning-circle" size="sm" /> {media.error}</span>
                        : media.kind === "video" && media.id && !media.ready ? <><span className="spin-dot" />Meta is processing the video…</>
                        : live ? <><Icon name="check-circle-fill" size="sm" style={{ color: "var(--chat-deep)" }} /> Uploaded to {ident?.account?.name ?? "your ad account"}</>
                        : <>Preview only — connect an ad account to upload</>}
                      <span className="sp" /><span className="xs faint">Click to replace</span>
                    </div>
                  </>
                ) : (
                  <div className="drop-empty"><span className="icon-tile lg orange"><Icon name={format === "image" ? "image" : "video-camera"} /></span><b>Drop {format === "image" ? "an image" : "a video"} here, or click to choose</b><small>{format === "image" ? "JPG or PNG, up to 30 MB" : "MP4 or MOV, up to 95 MB · 5–60 seconds works best"}</small></div>
                )}
              </div>
              <input ref={fileRef} type="file" hidden accept={format === "image" ? "image/jpeg,image/png" : "video/mp4,video/quicktime"} onChange={(e) => { const f = e.target.files?.[0]; if (f) void pickFile(f); e.target.value = ""; }} data-testid="media-file" />
            </div>
          </section>

          {/* 6 text, budget, schedule */}
          <section className="card">
            <div className="sec-h"><span className="k">6</span><span className="grow"><b>Text, budget &amp; schedule</b><small>Short and friendly wins. You can pause any time.</small></span></div>
            <div className="sec-b">
              <div className={`field${flash.has("primaryText") ? " ai-flash" : ""}`}><label htmlFor="f-body">Primary text</label><textarea id="f-body" className="textarea" rows={3} value={primary} onChange={(e) => setPrimary(e.target.value.slice(0, 2200))} placeholder="Fresh mango cheesecake is back 🥭 Order on WhatsApp — same-day delivery across Kolkata." data-testid="f-body" /><span className={`hint${primary.length > 125 ? " warnh" : ""}`}>{primary.length} characters{primary.length > 125 ? " — text after ~125 characters is hidden behind “more”" : ""}</span></div>
              <div className="g2">
                <div className={`field${flash.has("headline") ? " ai-flash" : ""}`}><label htmlFor="f-headline">Headline</label><input id="f-headline" className="input" value={headline} onChange={(e) => setHeadline(e.target.value.slice(0, 255))} placeholder="Cheesecakes from ₹650" data-testid="f-headline" /><span className={`hint${headline.length > 40 ? " warnh" : ""}`} data-testid="cnt-headline">{headline.length} / 40</span></div>
                <div className="field"><label htmlFor="f-desc">Description <span className="opt">optional</span></label><input id="f-desc" className="input" value={desc} onChange={(e) => setDesc(e.target.value.slice(0, 255))} placeholder="Free delivery over ₹999" /></div>
              </div>
              <div className={`range${flash.has("dailyBudget") ? " ai-flash" : ""}`}><label className="label" htmlFor="f-budget">Daily budget</label><span className="bigbud">{inr(budget)}<small className="faint" style={{ fontSize: "var(--fs-md)", fontWeight: 700 }}> / day</small></span>
                <input type="range" min={100} max={10000} step={50} value={Math.min(Math.max(budget, 100), 10000)} onChange={(e) => setBudget(Number(e.target.value))} aria-label="Daily budget" />
                <input className="input" type="number" min={100} max={1000000} value={budget} onChange={(e) => setBudget(Number(e.target.value))} style={{ maxWidth: 160 }} aria-label="Daily budget in rupees" data-testid="f-budget" /></div>
              <div className="est"><div><span>30 days at most</span><b>{inr(budget * 30)}</b></div><div><span>Billed by</span><b>Meta, to the ad account</b></div></div>
              <div className="g2"><div className="field"><label htmlFor="f-start">Start <span className="opt">optional</span></label><input id="f-start" className="input" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} /><span className="hint">Empty = as soon as you resume it</span></div>
                <div className="field"><label htmlFor="f-stop">End <span className="opt">optional</span></label><input id="f-stop" className="input" type="datetime-local" value={stop} onChange={(e) => setStop(e.target.value)} /></div></div>
            </div>
          </section>

          {err && <div className="note bad" data-testid="wizard-error"><Icon name="warning-circle" /><span>{err}</span></div>}
          <div className="foot"><span className="xs faint grow" style={{ fontWeight: 600 }}>{live ? "Publishing creates the campaign on Meta as Paused — nothing spends until you resume it." : "Planner mode — drafts only."}</span>
            <button className="btn btn-soft" disabled={!!busy} onClick={() => void submit(false)} data-testid="wiz-draft">{busy === "draft" ? "Saving…" : "Save draft"}</button>
            <button className="btn btn-primary" disabled={!!busy} onClick={() => void submit(true)} data-testid="wiz-submit"><Icon name="paper-plane-tilt" />{busy === "publish" ? "Publishing…" : "Publish to Meta (paused)"}</button></div>
        </div>

        <aside className="side">
          <section className="card pv-card">
            <div className="card-h"><span className="h3">Preview</span><span className="sp" />
              <div className="seg sm">{([["meta", "Exact"], ["sketch", "Sketch"], ["chat", "Chat"]] as const).filter(([k]) => k !== "chat" || goal !== "website").map(([k, l]) => <button key={k} type="button" className={pvMode === k ? "on" : ""} onClick={() => setPvMode(k)} data-testid={`pv-${k}`}>{l}</button>)}</div></div>
            {pvMode === "meta" && (
              <div className="metapv" data-testid="meta-preview">
                <select className="select sm" value={metaFmt} onChange={(e) => setMetaFmt(e.target.value)} aria-label="Placement to preview">{META_FMTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                {!canMetaPv ? (
                  <div className="metapv-empty"><Icon name="eye" /><b>Meta&apos;s exact preview</b><small>{!live ? "Connect an ad account to see it." : !pageId ? "Choose your Facebook Page." : "Upload your image or video — then Meta renders the ad exactly as people will see it, per placement."}</small>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPvMode("sketch")}>See the quick sketch</button></div>
                ) : metaPv ? (
                  <div className={`metapv-frame${metaPvBusy ? " busy" : ""}`}><iframe key={metaPv.src} src={metaPv.src} width={metaPv.width} height={metaPv.height} title="Ad preview from Meta" loading="lazy" style={{ border: 0 }} /></div>
                ) : metaPvErr ? <div className="note warn" style={{ fontSize: "var(--fs-xs)" }}><Icon name="warning" size="sm" /><span>{metaPvErr}</span></div>
                  : <span className="sk" style={{ display: "block", height: 420 }} />}
                {canMetaPv && <small className="faint xs" style={{ fontWeight: 600 }}>Rendered by Meta from your current settings{metaPvBusy ? " · updating…" : ""}.</small>}
              </div>
            )}
            {pvMode === "sketch" && (<>
              <div className="seg sm" style={{ margin: "0 var(--pad) 10px" }}>{([["fb", "Facebook"], ["ig", "Instagram"], ["story", "Story"]] as const).map(([k, l]) => <button key={k} type="button" className={view === k ? "on" : ""} onClick={() => setView(k)}>{l}</button>)}</div>
            <div className={`ad v-${view}`}>
              <div className="ad-h"><span className="av xs c2">{(view === "fb" ? pageName : igName).slice(0, 1).toUpperCase()}</span><span className="grow"><b>{view === "fb" ? pageName : igName}</b><small>Sponsored</small></span><Icon name="dots-three" size="sm" /></div>
              {view === "fb" && <div className="ad-txt top">{primary || "Your primary text appears here."}</div>}
              <div className="ad-img" style={mediaSrc ? { backgroundImage: `url("${mediaSrc}")` } : undefined}>{!mediaSrc && <b data-testid="pv-headline">{headline || "Your image or video"}</b>}{mediaSrc && <span className="sr" data-testid="pv-headline">{headline}</span>}</div>
              <div className="ad-cta"><span className="trunc">{headline || "Your headline"}{desc && <small>{desc}</small>}</span><span className="b" style={goal === "website" ? { background: "#1877F2" } : goal === "instagram_dm" ? { background: "var(--social)" } : undefined}><Icon name={goal === "whatsapp" ? "whatsapp-logo" : goal === "instagram_dm" ? "instagram-logo" : "arrow-up-right"} size="sm" />{ctaLabel}</span></div>
              {view !== "fb" && <div className="ad-txt"><b>{igName}</b> {primary || "Your primary text appears here."}</div>}
            </div>
            </>)}
            {pvMode === "chat" && goal !== "website" && (
              <div className={`chatpv ${goal === "whatsapp" ? "wa" : "ig"}`} data-testid="chat-preview">
                <div className="cp-h"><span className="av xs c2">{(goal === "whatsapp" ? pageName : igName).slice(0, 1).toUpperCase()}</span><b>{goal === "whatsapp" ? pageName : igName}</b></div>
                <div className="cp-b">
                  <div className="cp-ad"><span className="cp-thumb" style={mediaSrc ? { backgroundImage: `url("${mediaSrc}")` } : undefined} /><span className="trunc"><b>{headline || "Your ad"}</b><small>From an ad</small></span></div>
                  <div className="cp-in"><span>{greeting.trim() || "Hello! Can I get more info on this?"}</span>{goal === "whatsapp" && extra !== "none" && <span className="cp-btn"><Icon name={extra === "call" ? "phone" : "arrow-square-out"} size="xs" />{extra === "call" ? "Call" : "Visit website"}</span>}</div>
                  {startMode === "questions" && questions.some((q) => q.trim()) ? <div className="cp-qs">{questions.filter((q) => q.trim()).map((q) => <span key={q}>{q}</span>)}</div> : null}
                </div>
                <div className="cp-f"><span className={startMode === "autofill" && autofill ? "typed" : ""}>{startMode === "autofill" ? autofill || "Message" : "Message"}</span><Icon name="paper-plane-right" size="sm" /></div>
              </div>
            )}
          </section>
          <section className="card aud">
            <div className="card-h"><span className="h3">Audience size</span></div>
            <div className="aud-b">
              {estimate ? <><b className="num">{big(estimate.lower)}–{big(estimate.upper)}</b><small>people a month match this — Meta&apos;s estimate</small></>
                : <small>{!live ? "Connect an ad account to see Meta's estimate." : locs.length ? "Calculating…" : "Add a location to see how many people you can reach."}</small>}
              <div className="aud-sum">
                <span><Icon name="map-pin" size="xs" />{locs.length ? locs.map((l) => l.type === "city" ? `${l.name} +${l.radiusKm ?? 25}km` : l.name).join(", ") : "No location yet"}</span>
                <span><Icon name="users" size="xs" />{ageMin}–{ageMax === 65 ? "65+" : ageMax} · {genders === "all" ? "everyone" : genders}{interests.length ? ` · ${interests.length} interest${interests.length > 1 ? "s" : ""}` : ""}</span>
                <span><Icon name="squares-four" size="xs" />{placeMode === "auto" ? "Advantage+ placements" : `${places.length} placement${places.length === 1 ? "" : "s"}`}</span>
              </div>
            </div>
          </section>
          <section className="card"><div className="card-h"><span className="h3">Before you publish</span></div>
            <div className="chk">
              {checks.map(([ok, t]) => <div key={t}><Icon name={ok ? "check-circle-fill" : "circle-notch"} style={{ color: ok ? "var(--chat-deep)" : "var(--ink-4)" }} />{t}</div>)}
              {!live && <div><Icon name="warning" style={{ color: "var(--banana-deep)" }} />No ad account connected</div>}
            </div></section>
        </aside>
      </div>
    </div>
  );
}
