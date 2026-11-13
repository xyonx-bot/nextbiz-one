"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";

/**
 * NextBiz Ads · Create — design v2 (nextbiz-one-v2/ads-create): four plain questions on one page with a live
 * ad preview. Saves a mock draft or submits it to (mock) review — demo-badged until an ad account is connected.
 * Validation (PLAN §5): name, objective, destination required; budget ₹1–₹1,00,000/day; copy within Meta limits.
 */
const GOALS: [string, string, string, string][] = [
  ["OUTCOME_ENGAGEMENT", "Message me on WhatsApp", "Ad opens a chat with your number. Lands in your inbox.", "whatsapp-logo"],
  ["OUTCOME_TRAFFIC", "Visit my website", "Send people to a page on your site.", "globe"],
  ["OUTCOME_LEADS", "Collect leads", "People fill a short form inside Instagram/Facebook.", "identification-card"],
  ["OUTCOME_AWARENESS", "Get more reach", "Show your brand to as many people as possible.", "users"],
];
const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

export function NewCampaignClient() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [objective, setObjective] = useState("OUTCOME_ENGAGEMENT");
  const [destination, setDestination] = useState<"whatsapp" | "website">("whatsapp");
  const [audience, setAudience] = useState("");
  const [budget, setBudget] = useState(1500);
  const [start, setStart] = useState("");
  const [stop, setStop] = useState("");
  const [headline, setHeadline] = useState("");
  const [body, setBody] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const problem = !name.trim() ? "Give your campaign a name" : budget <= 0 ? "Enter a budget above ₹0" : budget > 100000 ? "Daily budget max is ₹1,00,000"
    : stop && start && new Date(stop) <= new Date(start) ? "End date must be after the start date" : headline.length > 40 ? "Headline is over 40 characters" : body.length > 125 ? "Primary text is over 125 characters" : "";

  async function save(submit: boolean) {
    if (problem) { setErr(problem); return; }
    setBusy(true); setErr("");
    const res = await fetch("/api/ads/campaigns", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), objective, daily_budget: Math.round(budget), destination, audience: audience || null, creative_headline: headline || null, creative_body: body || null,
        start_time: start ? new Date(start).toISOString() : null, stop_time: stop ? new Date(stop).toISOString() : null, submit }),
    });
    const d = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok || !d?.ok) { setErr(d?.error ?? "Couldn't save the campaign."); return; }
    router.push(submit ? "/ads?status=IN_REVIEW" : "/ads?status=DRAFT");
  }

  return (
    <div className="pg-ads-create">
      <div className="cw" data-testid="ads-wizard">
        <div className="form">
          <section className="card">
            <div className="sec-h"><span className="k">1</span><span className="grow"><b>What do you want people to do?</b><small>We&apos;ll set up Meta&apos;s targeting for this goal.</small></span><span className="demo">Demo</span></div>
            <div className="sec-b">
              <div className="field"><label htmlFor="f-name">Campaign name <span className="opt">only you see this</span></label><input id="f-name" className="input" value={name} onChange={(e) => setName(e.target.value.slice(0, 80))} placeholder="Diwali offer — Kolkata" data-testid="f-name" /></div>
              <div className="goals" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
                {GOALS.map(([k, t, s, ic]) => (
                  <div key={k} className={`goal${objective === k ? " on" : ""}`} onClick={() => { setObjective(k); setDestination(k === "OUTCOME_TRAFFIC" ? "website" : "whatsapp"); }} role="radio" aria-checked={objective === k} tabIndex={0} data-testid={`obj-${k}`}>
                    <span className={`icon-tile ${objective === k ? "orange" : "neutral"}`}><Icon name={ic} /></span><b>{t}</b><small>{s}</small>
                    {k === "OUTCOME_ENGAGEMENT" && <span className="pill ads sm nodot rec">Best for you</span>}
                  </div>
                ))}
              </div>
              <div className="field"><label>Where should people land?</label>
                <div className="seg" style={{ alignSelf: "flex-start" }}>
                  <button type="button" className={destination === "whatsapp" ? "on" : ""} onClick={() => setDestination("whatsapp")} data-testid="dest-whatsapp">WhatsApp chat</button>
                  <button type="button" className={destination === "website" ? "on" : ""} onClick={() => setDestination("website")} data-testid="dest-website">Website</button></div></div>
            </div>
          </section>
          <section className="card">
            <div className="sec-h"><span className="k">2</span><span className="grow"><b>Who should see it?</b><small>Start broad — Meta finds the right people.</small></span></div>
            <div className="sec-b"><div className="field"><label htmlFor="f-audience">Describe your audience <span className="opt">optional</span></label>
              <input id="f-audience" className="input" value={audience} onChange={(e) => setAudience(e.target.value.slice(0, 200))} placeholder="Kolkata + 25 km, age 24–55, small business owners" data-testid="f-audience" />
              <span className="hint" data-testid="cnt-audience">{audience.length} / 200</span></div></div>
          </section>
          <section className="card">
            <div className="sec-h"><span className="k">3</span><span className="grow"><b>Budget &amp; schedule</b><small>You can pause or change this any time.</small></span></div>
            <div className="sec-b">
              <div className="range"><label className="label" htmlFor="f-budget">Daily budget</label><span className="bigbud">{inr(budget)}<small className="faint" style={{ fontSize: "var(--fs-md)", fontWeight: 700 }}> / day</small></span>
                <input id="f-budget" type="range" min={100} max={20000} step={100} value={Math.min(budget, 20000)} onChange={(e) => setBudget(Number(e.target.value))} aria-label="Daily budget" />
                <input className="input" type="number" min={0} max={100000} value={budget} onChange={(e) => setBudget(Number(e.target.value))} style={{ maxWidth: 160 }} aria-label="Daily budget in rupees" data-testid="f-budget" /></div>
              <div className="est"><div><span>Monthly at most</span><b>{inr(budget * 30)}</b></div><div><span>Estimated chats / day</span><b>{Math.round(budget / 39)}–{Math.round(budget / 24)}</b></div></div>
              <div className="g2"><div className="field"><label htmlFor="f-start">Start</label><input id="f-start" className="input" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} /><span className="hint">Leave empty to start right after approval</span></div>
                <div className="field"><label htmlFor="f-stop">End <span className="opt">optional</span></label><input id="f-stop" className="input" type="datetime-local" value={stop} onChange={(e) => setStop(e.target.value)} /></div></div>
            </div>
          </section>
          <section className="card">
            <div className="sec-h"><span className="k">4</span><span className="grow"><b>Your ad</b><small>A short, friendly message.</small></span></div>
            <div className="sec-b">
              <div className="field"><label htmlFor="f-headline">Headline</label><input id="f-headline" className="input" value={headline} onChange={(e) => setHeadline(e.target.value.slice(0, 120))} placeholder="Websites from ₹9,999" data-testid="f-headline" /><span className={`hint${headline.length > 40 ? " err" : ""}`} data-testid="cnt-headline">{headline.length} / 40</span></div>
              <div className="field"><label htmlFor="f-body">Primary text</label><textarea id="f-body" className="textarea" rows={3} value={body} onChange={(e) => setBody(e.target.value.slice(0, 600))} placeholder="Need a website for your shop? Chat with us on WhatsApp for a free quote." data-testid="f-body" /><span className={`hint${body.length > 125 ? " err" : ""}`}>{body.length} / 125 — longer text gets cut off</span></div>
            </div>
          </section>
          {err && <div className="note bad" data-testid="wizard-error"><Icon name="warning-circle" /><span>{err}</span></div>}
          <div className="foot"><span className="xs faint grow" style={{ fontWeight: 600 }}>Demo — nothing is charged or published.</span>
            <button className="btn btn-soft" disabled={busy} onClick={() => void save(false)} data-testid="wiz-draft">Save draft</button>
            <button className="btn btn-primary" disabled={busy} onClick={() => void save(true)} data-testid="wiz-submit"><Icon name="paper-plane-tilt" />Submit for review</button></div>
        </div>
        <aside className="side">
          <section className="card">
            <div className="card-h"><span className="h3">Preview</span><span className="xs faint" style={{ fontWeight: 600 }}>Instagram feed</span></div>
            <div className="ad">
              <div className="ad-h"><span className="av xs c2">Y</span><span className="grow"><b>your.business</b><small>Sponsored</small></span><Icon name="dots-three" size="sm" /></div>
              <div className="ad-img"><b data-testid="pv-headline">{headline || "Your headline here"}</b></div>
              <div className="ad-cta"><span>{destination === "whatsapp" ? "Chat with us" : "Learn more"}</span><span className="b" style={destination === "website" ? { background: "#1877F2" } : undefined}><Icon name={destination === "whatsapp" ? "whatsapp-logo" : "arrow-up-right"} size="sm" />{destination === "whatsapp" ? "Send message" : "Visit site"}</span></div>
              <div className="ad-txt"><b>your.business</b> {body || "Your primary text appears here."}</div>
            </div>
          </section>
          <section className="card"><div className="card-h"><span className="h3">Before you submit</span></div>
            <div className="chk">
              <div><Icon name={name.trim() ? "check-circle-fill" : "warning"} style={{ color: name.trim() ? "var(--chat-deep)" : "var(--banana-deep)" }} />Campaign named</div>
              <div><Icon name={headline && headline.length <= 40 ? "check-circle-fill" : "warning"} style={{ color: headline && headline.length <= 40 ? "var(--chat-deep)" : "var(--banana-deep)" }} />Headline within 40 characters</div>
              <div><Icon name="warning" style={{ color: "var(--banana-deep)" }} />No ad account connected (demo)</div>
            </div></section>
        </aside>
      </div>
    </div>
  );
}
