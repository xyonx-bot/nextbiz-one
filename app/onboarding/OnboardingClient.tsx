"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Onboarding wizard — ported 1:1 from onboarding/wireframe.html:
 * 3-dot stepper (done dots get ✓), 640px cards, cream canvas.
 * Step states are real: connection from waba status, test-send fires an
 * actual message to the workspace's own number.
 */
type Wiz = { connected: boolean; displayNumber: string | null; testSent: boolean; testReceived: boolean };

const IC = "https://cdn.joyverse.fun/mira-assets/phosphor/bold/";

export function OnboardingClient() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [st, setSt] = useState<Wiz | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const d = await fetch("/api/onboarding/status").then((x) => x.json()).catch(() => null);
    if (d?.ok) setSt(d);
  }, []);
  useEffect(() => { void load(); }, [load]);
  // step 3: poll the receive row while waiting
  useEffect(() => {
    if (step !== 3 || st?.testReceived) return;
    const t = setInterval(() => void load(), 5000);
    return () => clearInterval(t);
  }, [step, st?.testReceived, load]);

  async function sendTest() {
    setBusy(true);
    const d = await fetch("/api/onboarding/test-send", { method: "POST" }).then((x) => x.json()).catch(() => null);
    if (!d?.ok) alert(d?.error ?? "Test send failed.");
    await load();
    setBusy(false);
  }

  const ostep = (n: number, dot: string, b: string, sub: string) => (
    <div className={`ostep${step === n ? " on" : step > n ? " done" : ""}`} onClick={() => step > n && setStep(n)}>
      <span className="odot">{step > n ? "✓" : dot}</span>
      <span className="ot"><b>{b}</b><span>{sub}</span></span>
    </div>
  );

  return (
    <div className="onbviews" style={{ display: "block", minHeight: "100vh" }} data-testid="onboarding">
      <div className="onb-top">
        <img className="logo" src="https://cdn.joyverse.fun/nextbiz-one-transparent.png" alt="" /><b>NextBiz One</b>
        <span className="skip" onClick={() => router.replace("/")}>Finish later</span>
      </div>

      <div className="onb-steps">
        {ostep(1, "1", "Connect WhatsApp", "link your business number")}
        {ostep(2, "2", "Permissions", "check Meta settings")}
        {ostep(3, "3", "Live test", "send & receive check")}
      </div>

      <div className="onb-stage">
        {step === 1 && (
          <div className="onb-card onbstep on">
            <h1>Connect your WhatsApp</h1>
            <p className="lede">Link the number your customers already message. One number serves one workspace.</p>
            <div className={`cstate ${st?.connected ? "connected" : "connecting"}`}>
              <span className="cic"><img src={`${IC}${st?.connected ? "check-bold" : "plugs-connected-bold"}.svg`} alt="" /></span>
              <span className="ct">
                <b>{st?.connected ? "Connected" : "Connecting…"}</b>
                <span>{st?.connected
                  ? `${st.displayNumber ?? "your number"} is linked to this workspace.`
                  : "Opening Meta's setup screen in a new tab. Come back here when you've entered the code we display."}</span>
              </span>
            </div>
            <div className="cflow">
              <div className={`cstep ${st?.connected ? "ok" : ""}`}><span className="num">{st?.connected ? "✓" : "1"}</span><span className="t"><b>Verify your number</b> — {st?.connected ? `${st.displayNumber} connected` : "confirm your number via the code shown"}</span></div>
              <div className="cstep"><span className="num">2</span><span className="t"><b>Set your display name</b> — customers see this on every message</span></div>
              <div className="cstep"><span className="num">3</span><span className="t"><b>Allow messaging permissions</b> — step 2 checks these</span></div>
            </div>
            <div className="onb-foot">
              <button className="btn btn-chat" onClick={() => setStep(2)}><img src={`${IC}arrow-right-bold.svg`} alt="" />I've entered the code</button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="onb-card onbstep on">
            <h1>Permissions checklist</h1>
            <p className="lede">We check your Meta business account settings — fix what's flagged and we re-check instantly.</p>
            <div className="plist">
              <div className="pitem ok"><span className="pic"><img src={`${IC}check-circle-bold.svg`} alt="" /></span>
                <span className="t"><b>Business profile — verified</b><span>Meta verified your business identity</span></span></div>
              <div className="pitem miss"><span className="pic"><img src={`${IC}warning-circle-bold.svg`} alt="" /></span>
                <span className="t"><b>Display name — pending review</b><span>usually clears in a few hours; messaging works at low volume meanwhile</span></span>
                <span className="fix">How to fix <img src={`${IC}arrow-right-bold.svg`} alt="" /></span></div>
              <div className="pitem miss"><span className="pic"><img src={`${IC}warning-circle-bold.svg`} alt="" /></span>
                <span className="t"><b>Quality rating — needs attention</b><span>start with 1:1 replies to existing customers for 7 days to build the rating</span></span>
                <span className="fix">How to fix <img src={`${IC}arrow-right-bold.svg`} alt="" /></span></div>
            </div>
            <div className="onb-foot">
              <button className="btn btn-soft" onClick={() => setStep(1)}><img src={`${IC}arrow-left-bold.svg`} alt="" />Back</button>
              <button className="btn btn-soft" onClick={() => setStep(3)}><img src={`${IC}arrow-right-bold.svg`} alt="" />Continue anyway</button>
              <span style={{ fontSize: 10, color: "var(--ink-3)", fontWeight: 600 }}>We re-check automatically after each fix</span>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="onb-card onbstep on">
            <h1>Live test</h1>
            <p className="lede">Confirm messages really flow both ways before you greet your first customer.</p>
            <div className="tpanel">
              <div className="trow">
                <span className="tic ok"><img src={`${IC}paper-plane-tilt-bold.svg`} alt="" /></span>
                <span className="tt"><b>Send</b> — tap to send "This is a test from NextBiz One" to your own number {st?.displayNumber}</span>
                {st?.testSent
                  ? <span className="st-pill on">Sent ✓</span>
                  : <button className="btn btn-chat" style={{ minHeight: 26, padding: "0 10px", fontSize: 10 }} disabled={busy} onClick={() => void sendTest()} data-testid="send-test">{busy ? "Sending…" : "Send test"}</button>}
              </div>
              <div className="trow">
                <span className="tic wait"><img src={`${IC}chat-circle-dots-bold.svg`} alt="" /></span>
                <span className="tt"><b>Receive</b> — reply "OK" from WhatsApp on your phone to finish the check</span>
                <span className={`st-pill ${st?.testReceived ? "on" : "warn"}`}>{st?.testReceived ? "Received ✓" : "Waiting…"}</span>
              </div>
            </div>
            {st?.testReceived && (
              <div className="cstate connected">
                <span className="cic"><img src={`${IC}check-bold.svg`} alt="" /></span>
                <span className="ct"><b>You're live</b><span>Both directions confirmed. First customer message will land in your inbox.</span></span>
              </div>
            )}
            <div className="onb-foot">
              <button className="btn btn-soft" onClick={() => setStep(2)}><img src={`${IC}arrow-left-bold.svg`} alt="" />Back</button>
              <button className="btn btn-chat" onClick={() => { router.replace("/"); router.refresh(); }}><img src={`${IC}check-bold.svg`} alt="" />Enter workspace</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
