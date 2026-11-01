"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * P2.2 guided campaign creation — 7-step wizard, ported 1:1 from
 * ~/workspaces/mira/prototypes/nextbiz-one/ads/create/wireframe.html.
 * Steps: 1 basics (name+objective) · 2 audience · 3 budget & schedule ·
 * 4 creative & copy · 5 destination · 6 review · 7 submit.
 * Per-step validation: name required, objective picked, budget > 0,
 * destination picked (PLAN §5). Live ad preview + counters in the right rail.
 * Mock-badged; submit:true → in_review (Meta review shape), else draft.
 */
const P = "https://cdn.joyverse.fun/mira-assets/phosphor/bold";

const OBJECTIVES = [
  { v: "OUTCOME_ENGAGEMENT", label: "WhatsApp messages", sub: "Drive conversations in chat" },
  { v: "OUTCOME_TRAFFIC", label: "Website visits", sub: "Send people to your site" },
  { v: "OUTCOME_LEADS", label: "Lead signups", sub: "Collect signups and enquiries" },
  { v: "OUTCOME_SALES", label: "Catalog sales", sub: "Sell products from your catalog" },
  { v: "OUTCOME_AWARENESS", label: "Brand awareness", sub: "Get your name seen" },
] as const;

const STEPS = [
  { t: "Campaign basics", s: "Name + objective" },
  { t: "Audience", s: "Who sees it" },
  { t: "Budget & schedule", s: "₹/day + dates" },
  { t: "Creative & copy", s: "Headline + body" },
  { t: "Destination", s: "WhatsApp / website" },
  { t: "Review", s: "Preview + check" },
  { t: "Submit", s: "Draft or review" },
];

type Form = {
  name: string;
  objective: string;
  audience: string;
  daily_budget: string;
  start: string;
  stop: string;
  startNow: boolean;
  headline: string;
  body: string;
  destination: string;
};

const EMPTY: Form = {
  name: "", objective: "", audience: "", daily_budget: "",
  start: "", stop: "", startNow: true, headline: "", body: "", destination: "",
};

export function NewCampaignClient() {
  const router = useRouter();
  const [step, setStep] = useState(0); // 0-based
  const [f, setF] = useState<Form>(EMPTY);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setF((p) => ({ ...p, [k]: v }));
    setErr("");
  };

  /** Required-field validation shared by Continue and draft/submit. */
  function validateRequired(): string {
    if (!f.name.trim()) return "Give the campaign a name";
    if (!f.objective) return "Pick an objective";
    const b = Number(f.daily_budget);
    if (!f.daily_budget || isNaN(b) || b <= 0) return "Enter a budget above ₹0";
    if (b > 100000) return "Daily budget max is ₹1,00,000";
    if (!f.destination) return "Pick a destination";
    return "";
  }

  /** Per-step validation for Continue (PLAN §5: name, objective, budget>0, destination). */
  function stepError(): string {
    if (step === 0) {
      if (!f.name.trim()) return "Give the campaign a name";
      if (!f.objective) return "Pick an objective";
    }
    if (step === 2) {
      const b = Number(f.daily_budget);
      if (!f.daily_budget || isNaN(b) || b <= 0) return "Enter a budget above ₹0";
      if (b > 100000) return "Daily budget max is ₹1,00,000";
      if (!f.startNow && f.start && f.stop && new Date(f.stop) <= new Date(f.start)) return "Stop must be after start";
    }
    if (step === 4 && !f.destination) return "Pick a destination";
    return "";
  }

  function next() {
    const e = stepError();
    if (e) return setErr(e);
    setStep((s) => Math.min(6, s + 1));
  }

  async function submit(submitForReview: boolean) {
    const e = validateRequired() || stepError();
    if (e) return setErr(e);
    setBusy(true);
    setErr("");
    const r = await fetch("/api/ads/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: f.name.trim(),
        objective: f.objective,
        daily_budget: Number(f.daily_budget),
        destination: f.destination,
        start_time: !f.startNow && f.start ? new Date(f.start).toISOString() : null,
        stop_time: !f.startNow && f.stop ? new Date(f.stop).toISOString() : null,
        creative_headline: f.headline.trim() || null,
        creative_body: f.body.trim() || null,
        audience: f.audience.trim() || null,
        submit: submitForReview,
      }),
    });
    setBusy(false);
    if (!r.ok) {
      const d = (await r.json().catch(() => null)) as { error?: string } | null;
      return setErr(d?.error ?? "Could not save the campaign — try again.");
    }
    router.push(submitForReview ? "/ads?status=IN_REVIEW" : "/ads?status=DRAFT");
  }

  const objLabel = OBJECTIVES.find((o) => o.v === f.objective)?.label ?? "—";
  const ctaLabel = f.destination === "website" ? "Visit website" : "Message us";

  return (
    <div className="wzone" data-testid="ads-wizard">
      {/* stepper */}
      <aside className="steps card" aria-label="Steps">
        {STEPS.map((s, i) => (
          <div key={i} className={`step${i < step ? " done" : ""}${i === step ? " cur" : ""}`}>
            <span className="num">{i < step ? <img src={`${P}/check-bold.svg`} alt="" /> : i + 1}</span>
            <div className="t"><b>{s.t}</b><span>{s.s}</span></div>
          </div>
        ))}
      </aside>

      {/* form */}
      <section className="wform card" aria-label="Step form">
        <div className="wf-head">
          <span className="crumb">Step {step + 1} of 7</span>
          <b>{STEPS[step].t}</b>
          <span className="badge-mock">Demo data</span>
        </div>
        <div className="wf-body">
          {step === 0 && (
            <>
              <div className="frow single">
                <div className="field">
                  <div className="lb">Campaign name <em>· 1–80 chars</em></div>
                  <input className={`inp${err && !f.name.trim() ? " err" : ""}`} value={f.name} maxLength={80}
                    onChange={(e) => set("name", e.target.value)} placeholder="e.g. Diwali Sale Push" aria-label="Campaign name" data-testid="f-name" />
                  <div className="hint">Shown in the campaigns list and in ad labels.</div>
                </div>
              </div>
              <div className="field">
                <div className="lb">Objective</div>
                {OBJECTIVES.map((o) => (
                  <div key={o.v} className={`optrow${f.objective === o.v ? " on" : ""}`} onClick={() => set("objective", o.v)} data-testid={`obj-${o.v}`}>
                    <span className="rad" />
                    <div className="t"><b>{o.label}</b><span>{o.sub}</span></div>
                  </div>
                ))}
              </div>
            </>
          )}

          {step === 1 && (
            <div className="frow single">
              <div className="field">
                <div className="lb">Audience <em>· optional · up to 200 chars</em></div>
                <textarea className="inp" style={{ minHeight: 110, resize: "vertical" }} value={f.audience} maxLength={200}
                  onChange={(e) => set("audience", e.target.value)} placeholder="e.g. Existing customers, 18–45, Kolkata · past 30 days" aria-label="Audience" data-testid="f-audience" />
                <div className="hint">Describe who should see this campaign — segment text only in the demo.</div>
              </div>
            </div>
          )}

          {step === 2 && (
            <>
              <div className="frow single">
                <div className="field">
                  <div className="lb">Daily budget <em>· INR · 0–100,000</em></div>
                  <div className="inpwrap" style={err && Number(f.daily_budget) <= 0 ? { borderColor: "var(--danger)" } : undefined}>
                    <span className="cur">₹</span>
                    <input value={f.daily_budget} inputMode="numeric" onChange={(e) => set("daily_budget", e.target.value.replace(/[^0-9]/g, ""))} placeholder="800" aria-label="Daily budget" data-testid="f-budget" />
                  </div>
                  <div className={`hint${err && Number(f.daily_budget) <= 0 ? " err" : ""}`}>Spent per day across all ad sets. <b>Must be above ₹0 to continue</b> — error state: red border + &ldquo;Enter a budget above ₹0&rdquo; under the field.</div>
                </div>
              </div>
              <div className="frow">
                <div className="field">
                  <div className="lb">Start</div>
                  <div className={`inpwrap${f.startNow ? " dis" : ""}`}>
                    <input type="datetime-local" disabled={f.startNow} value={f.start} placeholder="e.g. 2026-11-01 09:00" aria-label="Start" onChange={(e) => set("start", e.target.value)} data-testid="f-start" />
                  </div>
                </div>
                <div className="field">
                  <div className="lb">Stop <em>· optional</em></div>
                  <div className={`inpwrap${f.startNow ? " dis" : ""}`}>
                    <input type="datetime-local" disabled={f.startNow} value={f.stop} placeholder="e.g. 2026-11-30 23:59" aria-label="Stop" onChange={(e) => set("stop", e.target.value)} data-testid="f-stop" />
                  </div>
                </div>
              </div>
              <div className="tglrow">
                <button className={`tgl${f.startNow ? " on" : ""}`} onClick={() => set("startNow", !f.startNow)} aria-label="Start immediately" data-testid="tgl-startnow" />
                <span className="t">Start immediately — leave dates empty</span>
              </div>
              <div className="hint">When off, both datetime fields enable and accept ISO values; stop must be after start (validation error under Stop otherwise).</div>
            </>
          )}

          {step === 3 && (
            <>
              <div className="frow single">
                <div className="field">
                  <div className="lb">Ad headline <em>· up to 120 chars</em></div>
                  <input className="inp" value={f.headline} maxLength={120} onChange={(e) => set("headline", e.target.value)} placeholder="e.g. Diwali festive offers — up to 40% off" aria-label="Ad headline" data-testid="f-headline" />
                </div>
              </div>
              <div className="frow single">
                <div className="field">
                  <div className="lb">Ad body <em>· up to 600 chars</em></div>
                  <textarea className="inp" style={{ minHeight: 130, resize: "vertical" }} value={f.body} maxLength={600}
                    onChange={(e) => set("body", e.target.value)} placeholder="Flat 40% off all website packages this week. Tap to chat and we will send your custom quote." aria-label="Ad body" data-testid="f-body" />
                </div>
              </div>
            </>
          )}

          {step === 4 && (
            <div className="field">
              <div className="lb">Destination</div>
              <div className={`optrow${f.destination === "whatsapp" ? " on" : ""}`} onClick={() => set("destination", "whatsapp")} data-testid="dest-whatsapp">
                <span className="rad" />
                <div className="t"><b>WhatsApp</b><span>Ad opens a chat with your business number</span></div>
              </div>
              <div className={`optrow${f.destination === "website" ? " on" : ""}`} onClick={() => set("destination", "website")} data-testid="dest-website">
                <span className="rad" />
                <div className="t"><b>Website</b><span>Ad links out to your site</span></div>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="frow single">
              <div className="field">
                <div className="lb">Review</div>
                <div className="mgrid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 18px" }}>
                  <div className="m"><div className="k">Name</div><div className="v">{f.name || "—"}</div></div>
                  <div className="m"><div className="k">Objective</div><div className="v">{objLabel}</div></div>
                  <div className="m"><div className="k">Audience</div><div className="v">{f.audience || "Everyone"}</div></div>
                  <div className="m"><div className="k">Daily budget</div><div className="v">₹{f.daily_budget || "0"} / day</div></div>
                  <div className="m"><div className="k">Schedule</div><div className="v">{f.startNow ? "Starts immediately" : `${f.start || "—"} → ${f.stop || "ongoing"}`}</div></div>
                  <div className="m"><div className="k">Destination</div><div className="v">{f.destination === "website" ? "Website" : f.destination === "whatsapp" ? "WhatsApp" : "—"}</div></div>
                </div>
                <div className="hint">The ad preview on the right is live — it reflects headline, body and destination as you typed them.</div>
              </div>
            </div>
          )}

          {step === 6 && (
            <div className="frow single">
              <div className="field">
                <div className="lb">Submit</div>
                <div className="hint">
                  <b>Save as draft</b> keeps the campaign in Drafts — you can pause/resume it from the list.
                  <br /><b>Submit for review</b> sends it to Meta review (mock: lands in &ldquo;Needs review&rdquo;) — Meta typically responds within a few hours.
                </div>
                {err && <div className="hint err" data-testid="wizard-error">{err}</div>}
              </div>
            </div>
          )}

          {step < 6 && err && <div className="hint err" data-testid="wizard-error">{err}</div>}
        </div>
        <div className="wf-foot">
          <button className="btn btn-ghost btn-sm" onClick={() => step > 0 && setStep(step - 1)} disabled={step === 0} data-testid="wiz-back">
            <img src={`${P}/arrow-left-bold.svg`} alt="" />Back
          </button>
          <span className="sp" />
          <button className="btn btn-soft btn-sm" onClick={() => submit(false)} disabled={busy} data-testid="wiz-draft">
            <img src={`${P}/files-bold.svg`} alt="" />{busy ? "Saving…" : "Save as draft"}
          </button>
          {step < 6 ? (
            <button className="btn btn-ads btn-sm" onClick={next} data-testid="wiz-next">
              Continue<img src={`${P}/caret-right-bold.svg`} alt="" />
            </button>
          ) : (
            <button className="btn btn-ads btn-sm" onClick={() => submit(true)} disabled={busy} data-testid="wiz-submit">
              <img src={`${P}/check-bold.svg`} alt="" />{busy ? "Submitting…" : "Submit for review"}
            </button>
          )}
        </div>
      </section>

      {/* live ad preview */}
      <aside className="aprev card" aria-label="Ad preview">
        <div className="ap-head"><b>Ad preview</b><span>updates as you type</span></div>
        <div className="ap-body">
          <div className="adcard">
            <div className="ah"><span className="av">AS</span><div className="n"><b>Acme Studio</b><span>Sponsored</span></div></div>
            <div className="imgph"><img src={`${P}/image-square-bold.svg`} alt="" /></div>
            <div className="ab">
              <div className="hl" data-testid="pv-headline">{f.headline || "Your headline"}</div>
              <div className="bd" data-testid="pv-body">{f.body || "Your ad copy goes here."}</div>
            </div>
            <div className="cta"><img src={`${P}/${f.destination === "website" ? "globe" : "whatsapp-logo"}-bold.svg`} alt="" />{ctaLabel}</div>
          </div>
          <div className="counters">
            <span>Headline <b data-testid="cnt-headline">{f.headline.length}/120</b></span>
            <span>Body <b data-testid="cnt-body">{f.body.length}/600</b></span>
            <span>Audience <b data-testid="cnt-audience">{f.audience.length}/200</b></span>
          </div>
        </div>
      </aside>
    </div>
  );
}
