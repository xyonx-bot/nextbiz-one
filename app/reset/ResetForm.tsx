"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AuthBrand } from "@/components/AuthBrand";
import { Icon } from "@/components/Icon";

/** Set a new password from a one-time link. Signs out every device on success. */
export function ResetForm() {
  const token = useSearchParams().get("token") ?? "";
  const [valid, setValid] = useState<{ ok: boolean; email: string | null } | null>(null);
  const [pw, setPw] = useState(""); const [pw2, setPw2] = useState(""); const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [done, setDone] = useState(false);
  useEffect(() => { fetch(`/api/auth/reset?token=${encodeURIComponent(token)}`, { cache: "no-store" }).then((r) => r.json()).then(setValid).catch(() => setValid({ ok: false, email: null })); }, [token]);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (pw !== pw2) { setErr("The two passwords don't match."); return; }
    setBusy(true); setErr("");
    const r = await fetch("/api/auth/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password: pw }) }).catch(() => null);
    const d = (await r?.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    setBusy(false); if (d?.ok) setDone(true); else setErr(d?.error ?? "Couldn't save — try again.");
  }
  if (valid === null) return <div className="apanel authcard"><AuthBrand /><span className="sk" style={{ height: 160 }} /></div>;
  if (done || !valid.ok) return (
    <div className="apanel authcard" data-testid={done ? "reset-done" : "reset-invalid"}>
      <AuthBrand />
      <h2>{done ? "Password updated" : "This link doesn't work anymore"}</h2>
      <p className="sub">{done ? "You've been signed out everywhere. Log in with your new password." : "Reset links work once, for 24 hours. Ask for a new one and we'll send it."}</p>
      <a className="btn btn-primary btn-lg btn-full" href={done ? "/login" : "/forgot"}>{done ? "Log in" : "Ask for a new link"}</a>
    </div>
  );
  return (
    <form className="apanel authcard" onSubmit={submit}>
      <AuthBrand />
      <h2>Set a new password</h2><p className="sub">For {valid.email}. Use at least 8 characters.</p>
      <div className="field"><label htmlFor="pw">New password</label>
        <div className="pw"><input id="pw" className="input" type={show ? "text" : "password"} value={pw} onChange={(e) => setPw(e.target.value)} minLength={8} required autoComplete="new-password" data-testid="reset-pw" />
          <button className="btn btn-ghost btn-icon btn-sm" type="button" onClick={() => setShow((v) => !v)} aria-label={show ? "Hide password" : "Show password"}><Icon name={show ? "eye-slash" : "eye"} /></button></div></div>
      <div className="field"><label htmlFor="pw2">Type it again</label><input id="pw2" className="input" type={show ? "text" : "password"} value={pw2} onChange={(e) => setPw2(e.target.value)} minLength={8} required autoComplete="new-password" data-testid="reset-pw2" /></div>
      {err && <p className="aerr" role="alert"><Icon name="warning-circle" size="sm" />{err}</p>}
      <button className="btn btn-primary btn-lg btn-full" type="submit" disabled={busy} data-testid="reset-submit">{busy ? "Saving…" : "Save new password"}</button>
    </form>
  );
}
