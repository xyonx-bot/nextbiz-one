"use client";
import { useState } from "react";
import { AuthBrand } from "@/components/AuthBrand";
import { Icon } from "@/components/Icon";

/** Ask for a reset link. Our team sends it (to the account email) — there's no automatic email yet. */
export function ForgotForm() {
  const [email, setEmail] = useState(""); const [busy, setBusy] = useState(false); const [done, setDone] = useState(false); const [emailed, setEmailed] = useState(false); const [err, setErr] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr("");
    const r = await fetch("/api/auth/forgot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) }).catch(() => null);
    const d = (await r?.json().catch(() => null)) as { ok?: boolean; error?: string; emailed?: boolean } | null;
    setBusy(false); if (d?.ok) { setEmailed(!!d.emailed); setDone(true); } else setErr(d?.error ?? "Couldn't reach the server — try again.");
  }
  if (done) return (
    <div className="apanel authcard" data-testid="forgot-done">
      <AuthBrand />
      <img className="st-art" src="/art/request-pending.webp" alt="" width={132} height={132} />
      <h2 className="center">Request received</h2>
      <p className="sub center">{emailed
        ? <>If <b>{email}</b> has a NextBiz One account, a reset link is on its way. It works once, for 24 hours — check spam if you don&apos;t see it in a minute.</>
        : <>If <b>{email}</b> has a NextBiz One account, our team will email you a reset link — usually within a few hours on business days. The link works once, for 24 hours.</>}</p>
      <a className="btn btn-soft btn-lg btn-full" href="/login">Back to log in</a>
    </div>
  );
  return (
    <form className="apanel authcard" onSubmit={submit}>
      <AuthBrand />
      <h2>Forgot your password?</h2><p className="sub">Enter the email you log in with and we&apos;ll send you a link to set a new one.</p>
      <div className="field"><label htmlFor="email">Work email</label><input id="email" className="input" type="email" placeholder="you@business.com" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" data-testid="forgot-email" /></div>
      {err && <p className="aerr" role="alert"><Icon name="warning-circle" size="sm" />{err}</p>}
      <button className="btn btn-primary btn-lg btn-full" type="submit" disabled={busy} data-testid="forgot-submit">{busy ? "Sending…" : "Send me a reset link"}</button>
      <p className="foot">Remembered it? <a href="/login">Log in</a></p>
    </form>
  );
}
