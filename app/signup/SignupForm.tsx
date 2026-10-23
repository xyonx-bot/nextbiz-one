"use client";

import { useState } from "react";
import { StatusCard, type ReqStatus } from "../request-access/StatusCard";

export function SignupForm() {
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<ReqStatus | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(""); setBusy(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessName, email, password }),
      });
      const d = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; gated?: boolean } | null;
      if (!res.ok || !d?.ok) { setErr(d?.error ?? "Signup failed — try again."); }
      else if (d.gated) {
        setDone({ status: "pending", businessName, received: new Date().toISOString(), rejectReason: null });
      } else { window.location.href = "/"; return; }
    } catch { setErr("Network hiccup — try again."); }
    finally { setBusy(false); }
  }

  if (done) return <StatusCard st={done} />;

  return (
    <div className="authwrap">
      <div className="authcard">
        <h1>Create your workspace</h1>
        <p className="lede">Early access — invite-free, approval in ~1 day</p>
        <form onSubmit={submit}>
          <div className="afield">
            <label htmlFor="bn">Business name</label>
            <input id="bn" className="ain" type="text" placeholder="Acme Studio" value={businessName}
                   onChange={(e) => setBusinessName(e.target.value)} required minLength={2} />
          </div>
          <div className="afield">
            <label htmlFor="em">Work email</label>
            <input id="em" className="ain" type="email" placeholder="you@business.com" value={email}
                   onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </div>
          <div className="afield">
            <label htmlFor="pw">Password</label>
            <input id="pw" className="ain" type="password" placeholder="••••••••••" value={password}
                   onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
            <span className="ahint">8+ characters</span>
          </div>
          {err && <p className="aerr">{err}</p>}
          <button className="btn btn-chat abtn" type="submit" disabled={busy}>
            <img src="https://cdn.joyverse.fun/mira-assets/phosphor/bold/sign-in-bold.svg" alt="" />
            {busy ? "Creating…" : "Create workspace →"}
          </button>
        </form>
      </div>
      <div className="afoot">Already have an account? <a href="/login" style={{ color: "var(--chat-deep)" }}>Log in</a></div>
    </div>
  );
}
