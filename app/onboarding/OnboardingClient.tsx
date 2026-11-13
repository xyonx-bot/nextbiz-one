"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";

/**
 * Onboarding — design v2 (nextbiz-one-v2/onboarding): focused wizard with progress rail + help panel.
 * Every check is real: connection from waba_connections, inbound/template counts from the DB,
 * the live test sends an actual message to the workspace's own number and waits for the reply.
 */
type Wiz = { connected: boolean; displayName: string | null; displayNumber: string | null; inboundCount: number; approvedTemplates: number; testSent: boolean; testReceived: boolean };
const STEPS = ["Connect WhatsApp", "Check setup", "Live test"];

export function OnboardingClient() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [st, setSt] = useState<Wiz | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const d = await fetch("/api/onboarding/status", { cache: "no-store" }).then((x) => x.json()).catch(() => null);
    if (d?.ok) setSt(d);
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (step !== 2 || st?.testReceived) return;
    const t = setInterval(() => void load(), 4000);
    return () => clearInterval(t);
  }, [step, st?.testReceived, load]);

  async function sendTest() {
    setBusy(true); setErr("");
    const d = await fetch("/api/onboarding/test-send", { method: "POST" }).then((x) => x.json()).catch(() => null);
    if (!d?.ok) setErr(d?.error ?? "The test message couldn't be sent.");
    await load(); setBusy(false);
  }
  const enter = () => { router.replace("/"); router.refresh(); };
  const checks = st ? [
    { ok: st.connected, t: st.connected ? "Number connected" : "Number not connected", s: st.connected ? st.displayName ?? "Connected" : "Connect your number in step 1" },
    { ok: st.inboundCount > 0, t: st.inboundCount > 0 ? "Can receive messages" : "No messages received yet", s: st.inboundCount > 0 ? "Customer messages will reach your inbox" : "The live test in the next step confirms this" },
    { ok: st.approvedTemplates > 0, warn: true, t: st.approvedTemplates > 0 ? `${st.approvedTemplates} approved template${st.approvedTemplates > 1 ? "s" : ""}` : "No approved templates yet", s: st.approvedTemplates > 0 ? "You can message people after the 24-hour window and broadcast" : "Needed to message customers after 24 hours or send broadcasts — you can add one later", href: "/templates?new=1" },
  ] : [];

  return (
    <div className="pg-onb" data-testid="onboarding">
      <header className="top">
        <span className="brand"><img src="/logo.png" alt="" />NextBiz One</span>
        <nav className="prog" aria-label="Setup progress">
          {STEPS.map((l, i) => (
            <span key={l} className={`ps${step === i ? " on" : step > i ? " done" : ""}`} onClick={() => step > i && setStep(i)} role={step > i ? "button" : undefined}>
              <span className="k">{step > i ? <Icon name="check" size="xs" /> : i + 1}</span><span>{l}</span></span>
          ))}
        </nav>
        <button className="btn btn-ghost btn-sm" onClick={enter}>Finish later</button>
      </header>
      <div className="stage">
        <div>
          {step === 0 && (
            <section className="card main-card">
              <span className="eyebrow" style={{ color: "var(--chat-deep)" }}>Step 1 of 3</span>
              <h1>{st?.connected ? "Your WhatsApp is connected" : "Connect your WhatsApp Business number"}</h1>
              <p className="lead">{st?.connected ? "This is the number your customers message. Everything they send lands in your inbox." : "Link the number your customers already message. One number serves one workspace."}</p>
              {st === null ? <span className="sk" style={{ height: 64 }} /> : st.connected ? (
                <div className="ck ok" style={{ borderColor: "var(--chat-line)", background: "var(--chat-tint)" }}><span className="ic"><Icon name="check" size="xs" /></span>
                  <span><b>{st.displayName ?? "WhatsApp number"}</b><small>Connected to this workspace</small></span></div>
              ) : (
                <>
                  <div className="need">
                    <div><span className="icon-tile sm green"><Icon name="whatsapp-logo" /></span><span><b>A business phone number</b><small>Already on the WhatsApp Business app? It can move over.</small></span></div>
                    <div><span className="icon-tile sm" style={{ background: "#E7F0FE", color: "#1877F2" }}><Icon name="facebook-logo" /></span><span><b>A Facebook account</b><small>That manages your business page or portfolio.</small></span></div>
                  </div>
                  <div className="note info"><Icon name="info" /><span>During early access our team connects your number with you on a short call — <b>reply to your approval email</b> and we&apos;ll set it up together.</span></div>
                </>
              )}
              <div className="mfoot"><span className="sp" /><button className="btn btn-primary" onClick={() => setStep(1)} disabled={!st?.connected} data-testid="onb-next">Continue<Icon name="arrow-right" /></button></div>
            </section>
          )}
          {step === 1 && (
            <section className="card main-card">
              <span className="eyebrow" style={{ color: "var(--chat-deep)" }}>Step 2 of 3</span>
              <h1>{checks.filter((c) => !c.ok && !c.warn).length ? "A few things to finish" : "Your setup looks good"}</h1>
              <p className="lead">We checked your connection. Here&apos;s what we found, in plain words.</p>
              <div className="checks">
                {checks.map((c) => (
                  <div key={c.t} className={`ck ${c.ok ? "ok" : c.warn ? "" : "bad"}`} style={!c.ok && c.warn ? { background: "var(--banana-tint)", borderColor: "var(--banana-line)" } : undefined}>
                    <span className="ic" style={!c.ok && c.warn ? { background: "var(--banana)", color: "var(--ink)" } : undefined}><Icon name={c.ok ? "check" : c.warn ? "info" : "x"} size="xs" /></span>
                    <span><b>{c.t}</b><small>{c.s}</small></span>
                    {!c.ok && c.href && <a className="btn btn-soft btn-sm" href={c.href}>Create one</a>}
                  </div>
                ))}
              </div>
              <div className="mfoot"><button className="btn btn-soft" onClick={() => setStep(0)}>Back</button><span className="sp" /><button className="btn btn-ghost" onClick={() => void load()}>Re-check<Icon name="arrows-clockwise" /></button><button className="btn btn-primary" onClick={() => setStep(2)} disabled={!st?.connected}>Continue<Icon name="arrow-right" /></button></div>
            </section>
          )}
          {step === 2 && (
            <section className="card main-card">
              <span className="eyebrow" style={{ color: "var(--chat-deep)" }}>Step 3 of 3 · the fun part</span>
              <h1>Check messages flow both ways</h1>
              <p className="lead">We&apos;ll send a test to your business number. Reply to it from WhatsApp on your phone to finish.</p>
              <div className="col gap-12">
                <div className="well" style={{ padding: 14 }}><div className="eyebrow">Your business number</div><div className="num" style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-.02em", marginTop: 4 }}>{st?.displayNumber ?? "—"}</div></div>
                <div className="ck" style={st?.testSent ? { background: "var(--chat-tint)", borderColor: "var(--chat-line)" } : undefined}>
                  <span className="ic" style={st?.testSent ? { background: "var(--chat)", color: "var(--ink)" } : { background: "var(--sunken)" }}>{st?.testSent ? <Icon name="check" size="xs" /> : "1"}</span>
                  <span><b>Send a test message</b><small>“This is a test from NextBiz One”</small></span>
                  {!st?.testSent && <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => void sendTest()} data-testid="send-test">{busy ? "Sending…" : "Send test"}</button>}
                </div>
                {st?.testReceived ? (
                  <div className="got" style={{ display: "flex" }}><b style={{ fontSize: "var(--fs-sm)", color: "var(--chat-deep)", display: "flex", gap: 6, alignItems: "center" }}><Icon name="check-circle-fill" />Reply received — you&apos;re live!</b><span className="xs" style={{ color: "#3D5F07" }}>Both directions confirmed. Your first customer message will land in your inbox.</span></div>
                ) : (
                  <div className="wait"><span className="pulse" /><span><b>{st?.testSent ? "Waiting for your reply…" : "Then reply “OK” from your phone"}</b><small>We check every few seconds</small></span></div>
                )}
                {err && <div className="note bad"><Icon name="warning-circle" /><span>{err}</span></div>}
              </div>
              <div className="mfoot"><button className="btn btn-soft" onClick={() => setStep(1)}>Back</button><span className="sp" />{!st?.testReceived && <span className="xs faint" style={{ fontWeight: 600 }}>You can finish this later</span>}<button className="btn btn-primary" onClick={enter}>{st?.testReceived ? "Go to my inbox" : "Enter workspace"}<Icon name="arrow-right" /></button></div>
            </section>
          )}
        </div>
        <aside className="card help">
          <h3>Good to know</h3>
          <ul><li>Your customers won&apos;t notice anything — same number, same chats.</li><li>Free-form replies work for 24 hours after a customer writes; after that you use approved templates.</li><li>Broadcasts only ever go to people who opted in.</li></ul>
          <div className="divider" />
          <h3>Stuck?</h3>
          <div className="contact"><span className="av sm c1">NB</span><span className="grow"><b className="small">Talk to our team</b><br /><span className="xs faint">Reply to your approval email</span></span><Icon name="envelope-simple-open" style={{ color: "var(--chat-deep)" }} /></div>
        </aside>
      </div>
    </div>
  );
}
