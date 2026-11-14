/**
 * NextBiz Ads — building and publishing real campaigns on the connected Meta ad account.
 * Everything is created PAUSED: campaign → ad set → creative → ad. Nothing spends until the user
 * resumes it (with a confirmation) in Campaigns. If any step fails, the half-built campaign is deleted.
 */
import type { AdsConnection } from "./meta-ads";
import { tokenOf } from "./meta-ads";

const G = "https://graph.facebook.com/v21.0";

async function gget<T>(path: string, token: string): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const r = await fetch(`${G}${path}${path.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(15000) });
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (!r.ok || j.error) { const e = (j.error ?? {}) as { message?: string; error_user_msg?: string; error_user_title?: string }; return { ok: false, error: [e.error_user_title, e.error_user_msg ?? e.message].filter(Boolean).join(": ") || `Meta error ${r.status}` }; }
    return { ok: true, data: j as T };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}
async function gpost<T = Record<string, unknown>>(path: string, token: string, body: Record<string, unknown> | FormData): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    let init: RequestInit;
    if (body instanceof FormData) { body.set("access_token", token); init = { method: "POST", body }; }
    else {
      const form = new URLSearchParams({ access_token: token });
      for (const [k, v] of Object.entries(body)) if (v !== undefined && v !== null) form.set(k, typeof v === "string" ? v : JSON.stringify(v));
      init = { method: "POST", body: form, headers: { "Content-Type": "application/x-www-form-urlencoded" } };
    }
    const r = await fetch(`${G}${path}`, { ...init, signal: AbortSignal.timeout(120000) });
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (!r.ok || j.error) { const e = (j.error ?? {}) as { message?: string; error_user_msg?: string; error_user_title?: string }; return { ok: false, error: [e.error_user_title, e.error_user_msg ?? e.message].filter(Boolean).join(": ") || `Meta error ${r.status}` }; }
    return { ok: true, data: j as T };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}
const tok = (c: AdsConnection) => { const t = tokenOf(c); if (!t) throw new Error("The ad account login has expired — reconnect it in Connections."); return t; };

/* ── targeting search ── */

export type GeoHit = { key: string; name: string; type: "country" | "region" | "city" | "zip" | string; region?: string; country_code?: string; country_name?: string };
export async function searchLocations(c: AdsConnection, q: string, country = "IN"): Promise<GeoHit[]> {
  const t = tok(c);
  const types = encodeURIComponent(JSON.stringify(["country", "region", "city", "zip"]));
  const r = await gget<{ data: GeoHit[] }>(`/search?type=adgeolocation&q=${encodeURIComponent(q)}&location_types=${types}&limit=12${country ? `&country_code=${country}` : ""}`, t);
  const r2 = !r.ok || r.data.data.length === 0 && country ? await gget<{ data: GeoHit[] }>(`/search?type=adgeolocation&q=${encodeURIComponent(q)}&location_types=${types}&limit=12`, t) : r;
  return r2.ok ? r2.data.data.map((g) => ({ key: String(g.key), name: g.name, type: g.type, region: g.region, country_code: g.country_code, country_name: g.country_name })) : [];
}
export type InterestHit = { id: string; name: string; audience_size_lower_bound?: number; audience_size_upper_bound?: number; path?: string[] };
export async function searchInterests(c: AdsConnection, q: string): Promise<InterestHit[]> {
  const r = await gget<{ data: InterestHit[] }>(`/search?type=adinterest&q=${encodeURIComponent(q)}&limit=12&locale=en_US`, tok(c));
  return r.ok ? r.data.data.map((i) => ({ id: String(i.id), name: i.name, audience_size_lower_bound: i.audience_size_lower_bound, audience_size_upper_bound: i.audience_size_upper_bound, path: i.path })) : [];
}

/* ── identity (who the ad is from) ── */

export type Identity = { pages: { id: string; name: string; whatsapp: boolean | null }[]; instagram: { id: string; username: string }[]; pageError: string | null };
export async function identities(c: AdsConnection): Promise<Identity> {
  const t = tok(c);
  const acct = await gget<{ business?: { id: string } }>(`/${c.ad_account_id}?fields=business`, t);
  const biz = acct.ok ? acct.data.business?.id : undefined;
  const [promote, mine, owned, actIg, bizIg] = await Promise.all([
    gget<{ data: { id: string; name: string }[] }>(`/${c.ad_account_id}/promote_pages?fields=id,name&limit=50`, t),
    gget<{ data: { id: string; name: string }[] }>(`/me/accounts?fields=id,name&limit=50`, t),
    biz ? gget<{ data: { id: string; name: string }[] }>(`/${biz}/owned_pages?fields=id,name&limit=50`, t) : Promise.resolve(null),
    gget<{ data: { id: string; username: string }[] }>(`/${c.ad_account_id}/instagram_accounts?fields=id,username&limit=50`, t),
    biz ? gget<{ data: { id: string; username: string }[] }>(`/${biz}/instagram_accounts?fields=id,username&limit=50`, t) : Promise.resolve(null),
  ]);
  const uniq = <T extends { id: string }>(xs: (T[] | undefined)[]) => [...new Map(xs.flat().filter(Boolean).map((x) => [x!.id, x!])).values()];
  const found = uniq([promote.ok ? promote.data.data : [], mine.ok ? mine.data.data : [], owned?.ok ? owned.data.data : []]);
  // is a WhatsApp number linked to the Page? (click-to-WhatsApp ads need it) — null when Meta won't say
  const pages = await Promise.all(found.map(async (pg) => {
    const r = await gget<{ whatsapp_number?: string }>(`/${pg.id}?fields=whatsapp_number`, t);
    return { id: pg.id, name: pg.name, whatsapp: r.ok ? !!r.data.whatsapp_number : null };
  }));
  // system users often see an empty promote_pages list even with "Create ads" on the Page — only warn when the Page can't be read at all
  const readable = pages.some((p) => p.whatsapp !== null);
  return {
    pages,
    instagram: uniq([actIg.ok ? actIg.data.data : [], bizIg?.ok ? bizIg.data.data : []]),
    pageError: pages.length === 0 ? "No Facebook Page found for this ad account." : !readable
      ? "This ad account isn't allowed to advertise for your Page yet. In Meta Business Settings → Users → System users (or People), give it access to the Page with “Create ads”." : null,
  };
}

/* ── media ── */

export async function uploadImage(c: AdsConnection, file: Blob, name: string): Promise<{ ok: true; hash: string; url: string | null } | { ok: false; error: string }> {
  const fd = new FormData(); fd.set("filename", file, name);
  const r = await gpost<{ images?: Record<string, { hash: string; url?: string }> }>(`/${c.ad_account_id}/adimages`, tok(c), fd);
  if (!r.ok) return r;
  const img = Object.values(r.data.images ?? {})[0];
  return img ? { ok: true, hash: img.hash, url: img.url ?? null } : { ok: false, error: "Meta didn't return the image" };
}
export async function uploadVideo(c: AdsConnection, file: Blob, name: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const fd = new FormData(); fd.set("source", file, name); fd.set("name", name);
  const r = await gpost<{ id?: string }>(`/${c.ad_account_id}/advideos`, tok(c), fd);
  if (!r.ok) return r;
  return r.data.id ? { ok: true, id: r.data.id } : { ok: false, error: "Meta didn't return the video" };
}
export async function videoState(c: AdsConnection, id: string): Promise<{ ready: boolean; thumb: string | null; error: string | null }> {
  const t = tok(c);
  const [st, th] = await Promise.all([
    gget<{ status?: { video_status?: string; processing_progress?: number } }>(`/${id}?fields=status`, t),
    gget<{ data: { uri: string; is_preferred?: boolean }[] }>(`/${id}/thumbnails`, t),
  ]);
  const s = st.ok ? st.data.status?.video_status : undefined;
  const thumbs = th.ok ? th.data.data : [];
  return { ready: s === "ready", thumb: (thumbs.find((x) => x.is_preferred) ?? thumbs[0])?.uri ?? null, error: s === "error" ? "Meta couldn't process this video" : st.ok ? null : st.error };
}

/* ── the spec the builder sends ── */

export type Goal = "whatsapp" | "instagram_dm" | "website";
export type Placement = "facebook:feed" | "facebook:story" | "facebook:facebook_reels" | "facebook:video_feeds" | "facebook:marketplace"
  | "instagram:stream" | "instagram:story" | "instagram:reels" | "instagram:explore" | "messenger:messenger_home" | "messenger:story";
export type AdSpec = {
  name: string; goal: Goal; pageId: string; instagramId: string | null;
  locations: { key: string; type: string; name: string; radiusKm?: number }[];
  ageMin: number; ageMax: number; genders: "all" | "men" | "women"; interests: { id: string; name: string }[]; advantageAudience: boolean;
  placements: "auto" | Placement[];
  format: "image" | "video"; imageHash?: string | null; videoId?: string | null; videoThumb?: string | null;
  primaryText: string; headline: string; description?: string | null; websiteUrl?: string | null; cta?: string | null;
  welcome?: Welcome | null;
  dailyBudget: number; startTime?: string | null; endTime?: string | null;
};

export function targetingOf(s: Pick<AdSpec, "locations" | "ageMin" | "ageMax" | "genders" | "interests" | "advantageAudience" | "placements" | "goal">) {
  const geo: Record<string, unknown[]> = {};
  for (const l of s.locations) {
    if (l.type === "country") (geo.countries ??= []).push(l.key);
    else if (l.type === "region") (geo.regions ??= []).push({ key: l.key });
    else if (l.type === "city") (geo.cities ??= []).push({ key: l.key, radius: Math.min(80, Math.max(10, l.radiusKm ?? 25)), distance_unit: "kilometer" });
    else if (l.type === "zip") (geo.zips ??= []).push({ key: l.key });
  }
  const t: Record<string, unknown> = {
    geo_locations: { ...geo, location_types: ["home", "recent"] },
    age_min: s.ageMin, age_max: s.ageMax,
    targeting_automation: { advantage_audience: s.advantageAudience ? 1 : 0 },
  };
  if (s.genders !== "all") t.genders = [s.genders === "men" ? 1 : 2];
  if (s.interests.length) t.flexible_spec = [{ interests: s.interests.map((i) => ({ id: i.id, name: i.name })) }];
  if (s.placements !== "auto") {
    const pub = new Set<string>(), fb: string[] = [], ig: string[] = [], ms: string[] = [];
    for (const p of s.placements) {
      const [plat, pos] = p.split(":"); pub.add(plat);
      if (plat === "facebook") fb.push(pos); else if (plat === "instagram") ig.push(pos); else ms.push(pos);
    }
    // Messenger placements require Facebook feed in the same ad set
    if (pub.has("messenger") && !fb.includes("feed")) { pub.add("facebook"); fb.push("feed"); }
    t.publisher_platforms = [...pub];
    if (fb.length) t.facebook_positions = fb;
    if (ig.length) t.instagram_positions = ig;
    if (ms.length) t.messenger_positions = ms;
  }
  return t;
}

export async function estimateAudience(c: AdsConnection, s: Parameters<typeof targetingOf>[0]): Promise<{ lower: number; upper: number } | null> {
  if (!s.locations.length) return null;
  const goal = s.goal === "website" ? "LINK_CLICKS" : "CONVERSATIONS";
  const r = await gget<{ data: { estimate_mau_lower_bound?: number; estimate_mau_upper_bound?: number }[] }>(
    `/${c.ad_account_id}/delivery_estimate?optimization_goal=${goal}&targeting_spec=${encodeURIComponent(JSON.stringify(targetingOf(s)))}`, tok(c));
  const d = r.ok ? r.data.data[0] : null;
  return d?.estimate_mau_lower_bound != null ? { lower: d.estimate_mau_lower_bound, upper: d.estimate_mau_upper_bound ?? d.estimate_mau_lower_bound } : null;
}

/** Ad buttons. Messaging goals keep the chat destination whichever label is shown (verified against Meta). */
export const CTA_TYPES = ["LEARN_MORE", "SHOP_NOW", "ORDER_NOW", "BOOK_NOW", "GET_QUOTE", "CONTACT_US", "SIGN_UP", "APPLY_NOW", "GET_OFFER", "SUBSCRIBE", "SEE_MENU", "DOWNLOAD", "WATCH_MORE"];
/** What happens when the chat opens: the business's greeting + how the customer starts (pre-typed message or quick questions). */
export type Welcome = { greeting: string; mode: "autofill" | "questions"; autofill?: string | null; questions?: string[]; extra?: "none" | "call" | "url"; extraUrl?: string | null };

export function welcomeSpec(w: Welcome, goal: Goal): Record<string, unknown> | null {
  const greeting = w.greeting.trim();
  if (!greeting) return null;
  const message: Record<string, unknown> = { text: greeting };
  if (goal === "whatsapp" && w.extra === "call") message.automated_greeting_message_cta = { type: "call" };
  if (goal === "whatsapp" && w.extra === "url" && w.extraUrl) message.automated_greeting_message_cta = { type: "url", url: w.extraUrl };
  const qs = (w.questions ?? []).map((q) => q.trim()).filter(Boolean).slice(0, 4);
  if (w.mode === "questions" && qs.length) message.ice_breakers = qs.map((title) => ({ title }));
  else if (w.autofill?.trim()) message.autofill_message = { content: w.autofill.trim() };
  return {
    type: "VISUAL_EDITOR", version: 2, landing_screen_type: "welcome_message", media_type: "text",
    text_format: { customer_action_type: w.mode === "questions" && qs.length ? "ice_breakers" : "autofill_message", message },
  };
}

/** object_story_spec — the same for publishing and for Meta's exact preview. */
export function storySpecOf(s: Pick<AdSpec, "goal" | "pageId" | "instagramId" | "format" | "imageHash" | "videoId" | "videoThumb" | "primaryText" | "headline" | "description" | "websiteUrl" | "cta" | "welcome">) {
  const dest = s.goal === "whatsapp" ? "WHATSAPP" : s.goal === "instagram_dm" ? "INSTAGRAM_DIRECT" : null;
  const type = s.cta && CTA_TYPES.includes(s.cta) ? s.cta : dest === "WHATSAPP" ? "WHATSAPP_MESSAGE" : dest ? "INSTAGRAM_MESSAGE" : "LEARN_MORE";
  const cta = dest ? { type, value: { app_destination: dest } } : { type, value: { link: s.websiteUrl } };
  const link = s.goal === "website" ? s.websiteUrl! : s.goal === "whatsapp" ? "https://api.whatsapp.com/send" : "https://www.instagram.com/";
  const welcome = dest && s.welcome ? welcomeSpec(s.welcome, s.goal) : null;
  const story: Record<string, unknown> = { page_id: s.pageId, ...(s.instagramId ? { instagram_user_id: s.instagramId } : {}) };
  if (s.format === "video") {
    story.video_data = { video_id: s.videoId, image_url: s.videoThumb ?? undefined, message: s.primaryText, title: s.headline, link_description: s.description ?? undefined,
      call_to_action: { ...cta, value: { ...cta.value, ...(s.goal === "website" ? {} : { link }) } }, ...(welcome ? { page_welcome_message: welcome } : {}) };
  } else {
    story.link_data = { image_hash: s.imageHash, link, message: s.primaryText, name: s.headline, description: s.description ?? undefined, call_to_action: cta, ...(welcome ? { page_welcome_message: welcome } : {}) };
  }
  return story;
}

export const PREVIEW_FORMATS = ["MOBILE_FEED_STANDARD", "INSTAGRAM_STANDARD", "INSTAGRAM_STORY", "INSTAGRAM_REELS", "FACEBOOK_STORY_MOBILE", "FACEBOOK_REELS_MOBILE"] as const;
/** Meta's own rendering of the ad (an iframe it hosts) — exactly what people will see. */
export async function previewAd(c: AdsConnection, story: Record<string, unknown>, format: (typeof PREVIEW_FORMATS)[number]): Promise<{ ok: true; src: string; width: number; height: number } | { ok: false; error: string }> {
  const r = await gget<{ data?: { body?: string }[] }>(`/${c.ad_account_id}/generatepreviews?ad_format=${format}&creative=${encodeURIComponent(JSON.stringify({ object_story_spec: story }))}`, tok(c));
  if (!r.ok) return r;
  const body = r.data.data?.[0]?.body ?? "";
  const src = body.match(/src="([^"]+)"/)?.[1]?.replace(/&amp;/g, "&");
  const width = Number(body.match(/width="(\d+)"/)?.[1] ?? 320), height = Number(body.match(/height="(\d+)"/)?.[1] ?? 520);
  return src && /^https:\/\/[a-z.]*facebook\.com\//.test(src) ? { ok: true, src, width, height } : { ok: false, error: "Meta didn't return a preview" };
}

/** Publish: campaign → ad set → creative → ad, all PAUSED. Rolls back the campaign if a later step fails. */
export async function publishCampaign(c: AdsConnection, s: AdSpec): Promise<{ ok: true; campaignId: string; adSetId: string; adId: string } | { ok: false; error: string; step: string }> {
  const t = tok(c);
  const objective = s.goal === "website" ? "OUTCOME_TRAFFIC" : "OUTCOME_ENGAGEMENT";
  const camp = await gpost<{ id: string }>(`/${c.ad_account_id}/campaigns`, t, {
    name: s.name, objective, status: "PAUSED", special_ad_categories: [], is_adset_budget_sharing_enabled: false,
  });
  if (!camp.ok) return { ok: false, error: camp.error, step: "campaign" };
  const rollback = async () => { await gpost(`/${camp.data.id}`, t, { status: "DELETED" }).catch(() => null); };

  const adset = await gpost<{ id: string }>(`/${c.ad_account_id}/adsets`, t, {
    name: `${s.name} · audience`, campaign_id: camp.data.id, status: "PAUSED",
    daily_budget: String(Math.round(s.dailyBudget * 100)), // minor units (paise)
    billing_event: "IMPRESSIONS", bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    optimization_goal: s.goal === "website" ? "LINK_CLICKS" : "CONVERSATIONS",
    destination_type: s.goal === "whatsapp" ? "WHATSAPP" : s.goal === "instagram_dm" ? "INSTAGRAM_DIRECT" : "WEBSITE",
    promoted_object: s.goal === "website" ? undefined : { page_id: s.pageId },
    targeting: targetingOf(s),
    start_time: s.startTime || undefined, end_time: s.endTime || undefined,
  });
  if (!adset.ok) { await rollback(); return { ok: false, error: adset.error, step: "audience" }; }

  const story = storySpecOf(s);
  const creative = await gpost<{ id: string }>(`/${c.ad_account_id}/adcreatives`, t, { name: `${s.name} · creative`, object_story_spec: story });
  if (!creative.ok) { await rollback(); return { ok: false, error: creative.error, step: "creative" }; }

  const ad = await gpost<{ id: string }>(`/${c.ad_account_id}/ads`, t, { name: `${s.name} · ad`, adset_id: adset.data.id, creative: { creative_id: creative.data.id }, status: "PAUSED" });
  if (!ad.ok) { await rollback(); return { ok: false, error: ad.error, step: "ad" }; }
  return { ok: true, campaignId: camp.data.id, adSetId: adset.data.id, adId: ad.data.id };
}
