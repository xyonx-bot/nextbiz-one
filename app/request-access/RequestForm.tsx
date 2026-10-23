"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { StatusCard, type ReqStatus } from "./StatusCard";

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
    <div className="authwrap">
      <div className="authcard">
        <h1>Request workspace access</h1>
        <p className="lede">Review in ~1 day</p>
        <form onSubmit={submit}>
          <div className="afield">
            <label htmlFor="bn">Business name</label>
            <input id="bn" className="ain" type="text" placeholder="Acme Studio" value={businessName}
                   onChange={(e) => setBusinessName(e.target.value)} required minLength={2} />
          </div>
          <div className="afield">
            <label htmlFor="use">What will you use WhatsApp for?</label>
            <textarea id="use" className="ain" rows={4} placeholder="Reply to customer enquiries, share quotes, send order updates…"
                      value={useDescription} onChange={(e) => setUseDescription(e.target.value)} required minLength={10}
                      style={{ resize: "vertical" }} />
          </div>
          <div className="afield">
            <label htmlFor="em">Email</label>
            <input id="em" className="ain" type="email" placeholder="you@business.com" value={email}
                   onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </div>
          {err && <p className="aerr">{err}</p>}
          <button className="btn btn-chat abtn" type="submit" disabled={busy}>
            <img src="https://cdn.joyverse.fun/mira-assets/phosphor/bold/paper-plane-tilt-bold.svg" alt="" />
            {busy ? "Sending…" : "Send request"}
          </button>
        </form>
      </div>
      <div className="afoot"><a href="/login" style={{ color: "var(--chat-deep)" }}>Back to login</a></div>
    </div>
  );
}
