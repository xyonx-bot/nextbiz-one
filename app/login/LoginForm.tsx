"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { StatusCard, type ReqStatus } from "../request-access/StatusCard";
import { AuthBrand } from "@/components/AuthBrand";
import { Icon } from "@/components/Icon";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [gated, setGated] = useState<ReqStatus | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(""); setBusy(true);
    try {
      const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      const data = (await res.json().catch(() => null)) as { error?: string; gated?: boolean; status?: string; rejectReason?: string | null } | null;
      if (!res.ok) {
        if (data?.gated) setGated({ status: (data.status as "pending" | "rejected") ?? "pending", businessName: email.split("@")[0], received: new Date().toISOString(), rejectReason: data.rejectReason ?? null });
        else setErr(data?.error ?? "That email and password don't match. Try again.");
      } else {
        router.replace(params.get("next") || "/");
        router.refresh();
      }
    } catch { setErr("Couldn't reach the server — check your connection and try again."); }
    finally { setBusy(false); }
  }

  if (gated) return <StatusCard st={gated} />;
  return (
    <form className="apanel authcard" onSubmit={submit}>
      <AuthBrand />
      <h2>Welcome back</h2><p className="sub">Log in to your workspace.</p>
      <div className="field"><label htmlFor="email">Work email</label><input id="email" className="input" type="email" placeholder="you@business.com" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></div>
      <div className="field"><label htmlFor="password">Password</label>
        <div className="pw"><input id="password" className="input" type={show ? "text" : "password"} placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
          <button className="btn btn-ghost btn-icon btn-sm" type="button" onClick={() => setShow((v) => !v)} aria-label={show ? "Hide password" : "Show password"}><Icon name={show ? "eye-slash" : "eye"} /></button></div></div>
      {err && <p className="aerr" role="alert"><Icon name="warning-circle" size="sm" />{err}</p>}
      <button className="btn btn-primary btn-lg btn-full" type="submit" disabled={busy}>{busy ? "Logging in…" : "Log in"}</button>
      <div className="or">New to NextBiz One?</div>
      <a className="btn btn-soft btn-lg btn-full" href="/request-access">Request early access</a>
      <p className="foot">Have an invite? <a href="/signup">Create your workspace</a></p>
    </form>
  );
}
