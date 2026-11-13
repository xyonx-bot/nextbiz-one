"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { StatusCard, type ReqStatus } from "./StatusCard";
import { AuthBrand } from "@/components/AuthBrand";
import { Icon } from "@/components/Icon";

export function RequestForm() {
  const params = useSearchParams();
  const [businessName, setBusinessName] = useState("");
  const [useDescription, setUseDescription] = useState("");
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<ReqStatus | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(""); setBusy(true);
    try {
      const res = await fetch("/api/auth/request-access", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessName, useDescription, email }),
      });
      const d = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !d?.ok) setErr(d?.error ?? "Couldn't send the request.");
      else setDone({ status: "pending", businessName, received: new Date().toISOString(), rejectReason: null });
    } catch { setErr("Network hiccup — try again."); }
    finally { setBusy(false); }
  }

  if (done) return <StatusCard st={done} />;
  return (
    <form className="apanel authcard" onSubmit={submit}>
      <AuthBrand />
      <span className="ea"><Icon name="sparkle" size="xs" />Early access · free</span>
      <h2>Request early access</h2><p className="sub lede">Tell us about your business — we review in about a day.</p>
      <div className="field"><label htmlFor="bn">Business name</label><input id="bn" className="input" type="text" placeholder="Sweet Crumbs Bakery" value={businessName} onChange={(e) => setBusinessName(e.target.value)} required minLength={2} /></div>
      <div className="field"><label htmlFor="use">What will you use WhatsApp for?</label><textarea id="use" className="textarea" rows={3} placeholder="Reply to customer enquiries, share quotes, send order updates…" value={useDescription} onChange={(e) => setUseDescription(e.target.value)} required minLength={10} /></div>
      <div className="field"><label htmlFor="em">Email for updates</label><input id="em" className="input" type="email" placeholder="you@business.com" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></div>
      {err && <p className="aerr" role="alert"><Icon name="warning-circle" size="sm" />{err}</p>}
      <button className="btn btn-primary btn-lg btn-full" type="submit" disabled={busy}>{busy ? "Sending…" : "Request access"}</button>
      <p className="foot">Already approved? <a href="/login">Log in</a></p>
    </form>
  );
}
