"use client";

import { useState } from "react";
import { StatusCard, type ReqStatus } from "../request-access/StatusCard";
import { AuthBrand } from "@/components/AuthBrand";
import { Icon } from "@/components/Icon";

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
    <form className="apanel authcard" onSubmit={submit}>
      <AuthBrand />
      <span className="ea"><Icon name="sparkle" size="xs" />Early access · free</span>
      <h2>Create your workspace</h2><p className="sub lede">We review new workspaces within about a day.</p>
      <div className="field"><label htmlFor="bn">Business name</label><input id="bn" className="input" type="text" placeholder="Sweet Crumbs Bakery" value={businessName} onChange={(e) => setBusinessName(e.target.value)} required minLength={2} /></div>
      <div className="field"><label htmlFor="em">Work email</label><input id="em" className="input" type="email" placeholder="you@business.com" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></div>
      <div className="field"><label htmlFor="pw">Password</label><input id="pw" className="input" type="password" placeholder="At least 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
        <div className="meter" style={{ height: 4 }}><span style={{ width: `${Math.min(100, password.length * 9)}%`, background: password.length >= 12 ? "var(--chat)" : password.length >= 8 ? "var(--banana)" : "var(--danger)" }} /></div>
        <span className="hint">{password.length === 0 ? "8+ characters" : password.length < 8 ? `${8 - password.length} more character${8 - password.length === 1 ? "" : "s"}` : password.length < 12 ? "Good — longer is stronger" : "Strong password"}</span></div>
      {err && <p className="aerr" role="alert"><Icon name="warning-circle" size="sm" />{err}</p>}
      <button className="btn btn-primary btn-lg btn-full" type="submit" disabled={busy}>{busy ? "Creating…" : "Create workspace"}</button>
      <p className="foot">Already have an account? <a href="/login">Log in</a></p>
      <p className="afoot">By continuing you agree to our <a href="/privacy">Privacy Policy</a>.</p>
    </form>
  );
}
