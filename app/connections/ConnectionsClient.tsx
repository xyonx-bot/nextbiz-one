"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { AvatarPic } from "@/components/AvatarPic";
import { igPic } from "@/lib/ui";
import type { Channels } from "@/lib/channels";

/**
 * Connections — WhatsApp (Meta Embedded Signup), Instagram (Instagram Login) and Meta ads, each on its own.
 * A business can run on any one of them; pages that need a missing channel show a guided state that links here.
 */
type IgAccount = { username: string | null; display_name: string | null; live: boolean; expires_at: string | null; webhook_subscribed?: boolean; last_error?: string | null };
type Es = { ready: boolean; appId: string | null; configId: string | null };
type FB = { init: (o: Record<string, unknown>) => void; login: (cb: (r: { authResponse?: { code?: string; accessToken?: string } | null; status?: string }) => void, o: Record<string, unknown>) => void };
type AdAcct = { id: string; name: string; currency: string; status: number; business: string | null };
type AdsState = { connected: boolean; canUseSystem: boolean; appId: string | null; systemAccounts: AdAcct[];
  account: { id: string; name: string | null; lastError: string | null; live: { status: number; spent: number; balanceLabel: string | null } | null } | null };
declare global { interface Window { FB?: FB; fbAsyncInit?: () => void } }

const d8 = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

function loadFbSdk(appId: string): Promise<FB> {
  return new Promise((resolve, reject) => {
    if (window.FB) { resolve(window.FB); return; }
    window.fbAsyncInit = () => { window.FB!.init({ appId, autoLogAppEvents: true, xfbml: false, version: "v21.0" }); resolve(window.FB!); };
    const s = document.createElement("script");
    s.src = "https://connect.facebook.net/en_US/sdk.js"; s.async = true; s.defer = true; s.crossOrigin = "anonymous";
    s.onerror = () => reject(new Error("Facebook login couldn't load — check your connection or ad blocker and try again."));
    document.body.appendChild(s);
  });
}

export function ConnectionsClient({ channels, wa, es, igReady, adsDemo }: {
  channels: Channels;
  wa: { displayName: string | null; connected: boolean } | null;
  es: Es;
  igReady: boolean;
  adsDemo: boolean;
}) {
  const router = useRouter();
  const [ig, setIg] = useState<IgAccount | null | undefined>(undefined);
  const [busy, setBusy] = useState<"" | "wa" | "wa-off" | "ig-off" | "ads">("");
  const [ads, setAds] = useState<AdsState | null>(null);
  const [pick, setPick] = useState<AdAcct[] | null>(null);
  const userTok = useRef<string | null>(null);
  const loadAds = useCallback(async () => {
    const d = await fetch("/api/ads/connection", { cache: "no-store" }).then((x) => x.json()).catch(() => null);
    setAds(d?.ok ? d : { connected: false, canUseSystem: false, appId: null, systemAccounts: [], account: null });
  }, []);
  useEffect(() => { void loadAds(); }, [loadAds]);
  async function loginAds() {
    if (!ads?.appId) return;
    setBusy("ads");
    try {
      const FB = await loadFbSdk(ads.appId);
      const tok = await new Promise<string | null>((res) => FB.login((r) => res(r.authResponse?.accessToken ?? null), { scope: "ads_read,ads_management,business_management", return_scopes: true }));
      if (!tok) { setNote({ kind: "bad", text: "Facebook login was closed — nothing changed." }); return; }
      userTok.current = tok;
      const d = await fetch("/api/ads/connection", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "user", accessToken: tok }) }).then((x) => x.json()).catch(() => null);
      if (!d?.ok) { setNote({ kind: "bad", text: d?.error ?? "Couldn't read your ad accounts." }); return; }
      setPick(d.pick ?? []);
    } catch (e) { setNote({ kind: "bad", text: (e as Error).message }); } finally { setBusy(""); }
  }
  async function connectAds(adAccountId: string) {
    setBusy("ads");
    const body = userTok.current ? { mode: "user", accessToken: userTok.current, adAccountId } : { mode: "system", adAccountId };
    const d = await fetch("/api/ads/connection", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((x) => x.json()).catch(() => null);
    setBusy("");
    if (!d?.ok) { setNote({ kind: "bad", text: d?.error ?? "Couldn't connect the ad account." }); return; }
    setPick(null); userTok.current = null; setNote({ kind: "ok", text: `${d.account?.name ?? "Ad account"} connected — campaigns are live in NextBiz Ads` });
    await loadAds(); router.refresh();
  }
  async function disconnectAds() {
    setBusy("ads"); await fetch("/api/ads/connection", { method: "DELETE" }).catch(() => null); setBusy("");
    setNote({ kind: "ok", text: "Ad account disconnected — nothing changed on Meta" }); await loadAds(); router.refresh();
  }
  const [note, setNote] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);
  const [confirmOff, setConfirmOff] = useState(false);
  const [typed, setTyped] = useState("");
  const session = useRef<{ wabaId?: string; phoneNumberId?: string; cancelled?: boolean }>({});

  const loadIg = useCallback(async () => {
    const g = await fetch("/api/instagram/connect", { cache: "no-store" }).then((x) => x.json()).catch(() => null);
    setIg(g?.ok ? g.account ?? null : null);
  }, []);
  useEffect(() => { void loadIg(); }, [loadIg]);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("ig");
    if (q === "connected") setNote({ kind: "ok", text: "Instagram connected — DMs and comments now arrive in your inbox" });
    else if (q === "err-fbappid") setNote({ kind: "bad", text: "Instagram login is misconfigured on this server (Facebook app ID used instead of the Instagram app ID)." });
    else if (q === "err-noappid") setNote({ kind: "bad", text: "Instagram login isn't switched on for this server yet." });
    else if (q?.startsWith("err")) setNote({ kind: "bad", text: "Instagram connection failed — try again." });
    const h = window.location.hash.slice(1);
    if (h) requestAnimationFrame(() => document.getElementById(h)?.scrollIntoView({ block: "center" }));
  }, []);
  useEffect(() => { if (note) { const t = setTimeout(() => setNote(null), 5000); return () => clearTimeout(t); } }, [note]);

  // Embedded Signup reports the chosen WhatsApp account + number through postMessage
  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (!/(^|\.)facebook\.com$/.test(new URL(e.origin).hostname)) return;
      try {
        const d = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
        if (d?.type !== "WA_EMBEDDED_SIGNUP") return;
        if (d.event === "CANCEL") session.current.cancelled = true;
        else if (d.data?.waba_id) session.current = { wabaId: d.data.waba_id, phoneNumberId: d.data.phone_number_id };
      } catch { /* not ours */ }
    };
    window.addEventListener("message", on);
    return () => window.removeEventListener("message", on);
  }, []);

  async function connectWhatsApp() {
    if (!es.ready || !es.appId || !es.configId) return;
    setBusy("wa"); session.current = {};
    try {
      const FB = await loadFbSdk(es.appId);
      const code = await new Promise<string | null>((resolve) => {
        FB.login((r) => resolve(r.authResponse?.code ?? null), {
          config_id: es.configId, response_type: "code", override_default_response_type: true,
          extras: { setup: {}, featureType: "", sessionInfoVersion: "3" },
        });
      });
      if (!code) { setNote({ kind: "bad", text: session.current.cancelled ? "Connect cancelled — nothing was changed." : "The Facebook window closed before finishing." }); return; }
      // the session-info message can land just after the login callback
      for (let i = 0; i < 10 && !session.current.wabaId; i++) await new Promise((r) => setTimeout(r, 150));
      const d = await fetch("/api/whatsapp/embedded-signup", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, wabaId: session.current.wabaId ?? null, phoneNumberId: session.current.phoneNumberId ?? null }),
      }).then((x) => x.json()).catch(() => null);
      if (!d?.ok) { setNote({ kind: "bad", text: d?.error ?? "Connecting failed — try again." }); return; }
      setNote({ kind: "ok", text: `${d.displayName} is connected` });
      router.refresh();
    } catch (e) {
      setNote({ kind: "bad", text: (e as Error).message });
    } finally { setBusy(""); }
  }

  async function disconnectWhatsApp() {
    setBusy("wa-off");
    const d = await fetch("/api/whatsapp/connection", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: typed }) }).then((x) => x.json()).catch(() => null);
    setBusy("");
    if (!d?.ok) { setNote({ kind: "bad", text: d?.error ?? "Couldn't disconnect" }); return; }
    setConfirmOff(false); setTyped(""); setNote({ kind: "ok", text: "WhatsApp disconnected" }); router.refresh();
  }
  async function disconnectIg() {
    setBusy("ig-off");
    await fetch("/api/instagram/connect", { method: "DELETE" }).catch(() => null);
    setBusy(""); setNote({ kind: "ok", text: "Instagram disconnected" }); await loadIg(); router.refresh();
  }

  const waOn = !!wa?.connected;
  const waName = wa?.displayName?.replace(/\s*\(.*\)\s*$/, "") || "Your business";
  const waNum = wa?.displayName?.match(/\(([^)]+)\)/)?.[1] ?? null;
  const igOn = !!ig?.live;
  const count = [waOn, igOn || channels.instagram, !!ads?.connected || channels.ads].filter(Boolean).length;

  return (
    <div className="pg-conn" data-testid="connections">
      <section className="card conn-hero">
        <div className="grow">
          <span className="eyebrow">Your channels</span>
          <h1>Bring your customer channels together</h1>
          <p>WhatsApp, Instagram and Meta ads each connect on their own — use one, two or all three. Every page lights up as its channel connects.</p>
        </div>
        <div className="conn-meter" aria-label={`${count} of 3 channels connected`}>
          <div className="dots">
            <span className={`d green${waOn ? " on" : ""}`}><Icon name="whatsapp-logo" /></span>
            <span className={`d pink${igOn ? " on" : ""}`}><Icon name="instagram-logo" /></span>
            <span className={`d orange${ads?.connected || channels.ads ? " on" : ""}`}><Icon name="megaphone" /></span>
          </div>
          <b className="num">{count} of 3</b><small>connected</small>
        </div>
      </section>

      <div className="conn-grid">
        {/* WhatsApp */}
        <section id="whatsapp" className="card cc" data-state={waOn ? "on" : es.ready ? "ready" : "soon"} data-testid="cc-whatsapp">
          <div className="cc-h">
            <span className="icon-tile lg green"><Icon name="whatsapp-logo" /></span>
            <span className="grow"><b>WhatsApp Business</b><small>Official Cloud API · your own number</small></span>
            <span className={`pill sm ${waOn ? "ok" : es.ready ? "neutral" : "warn"}`}>{waOn ? "Connected" : es.ready ? "Not connected" : "Soon"}</span>
          </div>
          {waOn ? (
            <div className="cc-acct">
              <span className="av c1">{waName.slice(0, 2).toUpperCase()}</span>
              <span className="grow"><b className="trunc">{waName}</b><small className="num">{waNum ? `+${waNum}`.replace("++", "+") : "Number connected"}</small></span>
              <span className="live"><span className="pulse" />Live</span>
            </div>
          ) : null}
          {waOn ? (
            <ul className="cc-facts">
              <li><Icon name="clock-countdown" size="sm" /><span><b>24-hour reply window</b> after each customer message</span></li>
              <li><Icon name="users-three" size="sm" /><span><b>Broadcasts go to opted-in</b> customers only</span></li>
              <li><Icon name="seal-check" size="sm" /><span><b>Templates</b> are reviewed by Meta before use</span></li>
            </ul>
          ) : (
            <ol className="cc-steps">
              <li><b>Log in with Facebook</b><small>The account that manages your business</small></li>
              <li><b>Pick or create your business portfolio</b><small>No portfolio yet? The window creates one</small></li>
              <li><b>Add your number &amp; verify by code</b><small>Moving from the WhatsApp Business app? It can come along</small></li>
            </ol>
          )}
          <div className="cc-unl"><span className="eyebrow">Unlocks</span><span>Inbox</span><span>Contacts</span><span>Templates</span><span>Broadcasts</span><span>Automation</span></div>
          <div className="cc-f">
            {waOn ? (
              confirmOff ? (
                <div className="cc-confirm">
                  <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Type DISCONNECT" aria-label="Type DISCONNECT to confirm" />
                  <button className="btn btn-danger btn-sm" disabled={typed !== "DISCONNECT" || busy === "wa-off"} onClick={() => void disconnectWhatsApp()}>Disconnect</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => { setConfirmOff(false); setTyped(""); }}>Cancel</button>
                </div>
              ) : (
                <>
                  <a className="btn btn-soft btn-sm" href="/onboarding"><Icon name="paper-plane-tilt" />Run live test</a>
                  <span className="sp" />
                  <button className="btn btn-ghost btn-sm" onClick={() => setConfirmOff(true)} data-testid="wa-disconnect">Disconnect</button>
                </>
              )
            ) : es.ready ? (
              <button className="btn btn-primary" onClick={() => void connectWhatsApp()} disabled={busy === "wa"} data-testid="wa-connect">
                <Icon name="facebook-logo" />{busy === "wa" ? "Connecting…" : "Connect with Facebook"}
              </button>
            ) : (
              <div className="note warn cc-note" data-testid="wa-soon"><Icon name="info" /><span>Self-connect is being switched on. Until then our team connects your number with you on a short call — <b>reply to your approval email</b>.</span></div>
            )}
          </div>
        </section>

        {/* Instagram */}
        <section id="instagram" className="card cc" data-state={igOn ? "on" : igReady ? "ready" : "soon"} data-testid="cc-instagram">
          <div className="cc-h">
            <span className="icon-tile lg pink"><Icon name="instagram-logo" /></span>
            <span className="grow"><b>Instagram</b><small>DMs and comments from your professional account</small></span>
            <span className={`pill sm ${igOn ? "ok" : igReady ? "neutral" : "warn"}`}>{ig === undefined ? "…" : igOn ? "Connected" : igReady ? "Not connected" : "Soon"}</span>
          </div>
          {igOn && ig ? (
            <>
              <div className="cc-acct">
                <span className="av c3">{(ig.username ?? "IG").replace(/^@/, "").slice(0, 2).toUpperCase()}<AvatarPic src={(ig as { profile_picture_url?: string | null }).profile_picture_url} /></span>
                <span className="grow"><b className="trunc">@{(ig.username ?? "instagram").replace(/^@/, "")}</b><small>{ig.expires_at ? `Login valid until ${d8(ig.expires_at)} · renews itself` : "Connected"}</small></span>
                <span className={`live${ig.webhook_subscribed ? "" : " off"}`}><span className="pulse" />{ig.webhook_subscribed ? "Live" : "No events"}</span>
              </div>
              {ig.last_error && <div className="note bad cc-note"><Icon name="warning-circle" /><span>{ig.last_error}</span></div>}
            </>
          ) : (
            <ol className="cc-steps">
              <li><b>Use a professional account</b><small>Business or Creator — switch in Instagram settings for free</small></li>
              <li><b>Log in with Instagram</b><small>Approve messages and comments access</small></li>
              <li><b>Allow message access</b><small>Instagram → Settings → Messages → Connected tools</small></li>
            </ol>
          )}
          <div className="cc-unl"><span className="eyebrow">Unlocks</span><span>Inbox</span><span>Automation</span><span>Comment replies</span></div>
          <div className="cc-f">
            <a className={`btn ${igOn ? "btn-soft btn-sm" : "btn-primary"}`} href="/api/auth/instagram/start" aria-disabled={!igReady} data-testid="ig-connect"
              onClick={(e) => { if (!igReady) { e.preventDefault(); setNote({ kind: "bad", text: "Instagram login isn't switched on for this server yet." }); } }}>
              <Icon name="instagram-logo" />{igOn ? "Reconnect" : "Log in with Instagram"}
            </a>
            {igOn && <><span className="sp" /><button className="btn btn-ghost btn-sm" disabled={busy === "ig-off"} onClick={() => void disconnectIg()}>Disconnect</button></>}
          </div>
        </section>

        {/* Meta ads */}
        <section id="ads" className="card cc" data-state={ads?.connected ? "on" : "ready"} data-testid="cc-ads">
          <div className="cc-h">
            <span className="icon-tile lg orange"><Icon name="megaphone" /></span>
            <span className="grow"><b>Meta Ads</b><small>Click-to-WhatsApp &amp; Instagram campaigns</small></span>
            <span className={`pill sm ${ads?.connected ? "ok" : "neutral"}`}>{ads === null ? "…" : ads.connected ? "Connected" : "Not connected"}</span>
          </div>
          {ads?.connected && ads.account ? (
            <>
              <div className="cc-acct" style={{ background: "var(--ads-tint)", borderColor: "var(--ads-line)" }}>
                <span className="av c2">{(ads.account.name ?? "AD").slice(0, 2).toUpperCase()}</span>
                <span className="grow"><b className="trunc">{ads.account.name ?? "Ad account"}</b><small className="mono">{ads.account.id}</small></span>
                <span className={`live${ads.account.live?.status === 1 ? "" : " off"}`}><span className="pulse" />{ads.account.live?.status === 1 ? "Active" : "Check account"}</span>
              </div>
              <ul className="cc-facts">
                <li><Icon name="wallet" size="sm" /><span><b>{ads.account.live?.balanceLabel ?? "Billing with Meta"}</b> · spent so far ₹{Math.round(ads.account.live?.spent ?? 0).toLocaleString("en-IN")}</span></li>
                <li><Icon name="shield-check" size="sm" /><span><b>Meta bills this ad account</b> directly — NextBiz One never charges for ad spend</span></li>
                {ads.account.lastError && <li><Icon name="warning-circle" size="sm" /><span style={{ color: "var(--danger-deep)" }}>{ads.account.lastError}</span></li>}
              </ul>
            </>
          ) : (
            <ol className="cc-steps">
              <li><b>Log in with Facebook</b><small>The account with access to your ad account</small></li>
              <li><b>Choose an ad account</b><small>Billing stays with Meta — we never charge for ads</small></li>
              <li><b>Run from NextBiz Ads</b><small>See spend and chats per campaign, pause or resume</small></li>
            </ol>
          )}
          <div className="cc-unl"><span className="eyebrow">Unlocks</span><span>Campaigns</span><span>Create campaign</span><span>Performance</span></div>
          {pick && (
            <div className="cc-pick" data-testid="ads-pick">
              <span className="eyebrow">Choose an ad account</span>
              {pick.length === 0 && <p className="xs faint" style={{ fontWeight: 600 }}>No ad accounts on this login. Create one in Meta Business Settings, then try again.</p>}
              {pick.map((a) => (
                <button key={a.id} className="pick-row" disabled={busy === "ads"} onClick={() => void connectAds(a.id)}>
                  <span className="grow"><b>{a.name}</b><small className="mono">{a.id} · {a.currency}{a.business ? ` · ${a.business}` : ""}</small></span>
                  <span className={`pill sm ${a.status === 1 ? "ok" : "warn"}`}>{a.status === 1 ? "Active" : "Inactive"}</span>
                </button>
              ))}
            </div>
          )}
          <div className="cc-f">
            {ads?.connected ? (
              <><a className="btn btn-soft btn-sm" href="/ads"><Icon name="target" />Open campaigns</a><span className="sp" />
                <button className="btn btn-ghost btn-sm" disabled={busy === "ads"} onClick={() => void disconnectAds()} data-testid="ads-disconnect">Disconnect</button></>
            ) : (
              <>
                {ads?.canUseSystem && ads.systemAccounts.length > 0 && !pick && (
                  <button className="btn btn-primary" onClick={() => setPick(ads.systemAccounts)} data-testid="ads-connect-system"><Icon name="plugs-connected" />Connect your ad account</button>
                )}
                {!ads?.canUseSystem && <button className="btn btn-primary" disabled={busy === "ads" || !ads?.appId} onClick={() => void loginAds()} data-testid="ads-connect"><Icon name="facebook-logo" />{busy === "ads" ? "Connecting…" : "Log in with Facebook"}</button>}
                {ads?.canUseSystem && <button className="btn btn-ghost btn-sm" disabled={busy === "ads"} onClick={() => void loginAds()}><Icon name="facebook-logo" />Use a Facebook login</button>}
              </>
            )}
          </div>
          {!ads?.connected && (
            <div className="cc-f" style={{ paddingTop: 0 }}>
              {adsDemo
                ? <><a className="btn btn-soft btn-sm" href="/ads"><Icon name="play-circle" />Open demo</a><span className="sp" /><a className="btn btn-ghost btn-sm" href="/api/ads/demo?on=0&next=/connections">Turn off demo</a></>
                : <a className="btn btn-ghost btn-sm" href="/api/ads/demo?on=1&next=/ads" data-testid="ads-demo"><Icon name="play-circle" />Explore with demo data</a>}
            </div>
          )}
        </section>
      </div>

      <section className="card conn-faq">
        <div><span className="icon-tile sm grape"><Icon name="buildings" /></span><b>No Meta Business portfolio?</b><p>You don&apos;t need one first — the WhatsApp connect window creates it for you in a minute.</p></div>
        <div><span className="icon-tile sm green"><Icon name="device-mobile" /></span><b>Using the WhatsApp Business app?</b><p>Your number can move over. Customers keep chatting with the same number — nothing changes for them.</p></div>
        <div><span className="icon-tile sm pink"><Icon name="shield-check" /></span><b>Your access stays yours</b><p>Logins are stored encrypted for this workspace only. Disconnect any channel here at any time.</p></div>
      </section>

      {note && <div role="status" className={`conn-toast ${note.kind}`}>{note.text}</div>}
    </div>
  );
}
