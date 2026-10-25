"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { StatusCard, type ReqStatus } from "../request-access/StatusCard";
import { AuthBrand } from "../../components/AuthBrand";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [gated, setGated] = useState<ReqStatus | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json().catch(() => null)) as
        | { error?: string; gated?: boolean; status?: string; rejectReason?: string | null }
        | null;
      if (!res.ok) {
        if (data?.gated) {
          setGated({
            status: (data.status as "pending" | "rejected") ?? "pending",
            businessName: email.split("@")[0],
            received: new Date().toISOString(),
            rejectReason: data.rejectReason ?? null,
          });
        } else setErr(data?.error ?? "Login failed — try again.");
      } else {
        const next = params.get("next") || "/";
        router.replace(next);
        router.refresh();
      }
    } catch {
      setErr("Network hiccup — try again.");
    } finally {
      setBusy(false);
    }
  }

  if (gated) return <StatusCard st={gated} />;

  return (
    <div className="authwrap">
      <AuthBrand />
      <div className="authcard">
        <h1>Welcome back</h1>
        <p className="lede">Log in to your workspace</p>
        <form onSubmit={submit}>
          <div className="afield">
            <label htmlFor="email">Work email</label>
            <input id="email" className="ain" type="email" placeholder="you@business.com"
                   value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </div>
          <div className="afield">
            <label htmlFor="password">Password</label>
            <input id="password" className="ain" type="password" placeholder="••••••••••"
                   value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
            <span className="ahint">8+ characters</span>
          </div>
          {err && <p className="aerr">{err}</p>}
          <button className="btn btn-chat abtn" type="submit" disabled={busy}>
            <img src="https://cdn.joyverse.fun/mira-assets/phosphor/bold/sign-in-bold.svg" alt="" />
            {busy ? "Logging in…" : "Log In"}
          </button>
        </form>
        <div className="alinks">
          <span className="addlink">Forgot password?</span>
          <a className="addlink" href="/request-access">Request workspace access</a>
        </div>
      </div>
      <div className="afoot">New here? <a href="/signup" style={{ color: "var(--chat-deep)" }}>Create a workspace</a> — free while in early access.</div>
    </div>
  );
}
