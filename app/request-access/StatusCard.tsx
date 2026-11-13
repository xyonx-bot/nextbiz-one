"use client";

import { useRouter } from "next/navigation";
import { AuthBrand } from "@/components/AuthBrand";
import { Icon } from "@/components/Icon";

/** One request-status state per account: pending · approved · rejected (design v2 auth). */
export type ReqStatus = {
  status: "pending" | "approved" | "rejected";
  businessName: string;
  received: string;
  rejectReason: string | null;
};

export function StatusCard({ st }: { st: ReqStatus }) {
  const router = useRouter();
  const received = new Date(st.received).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  if (st.status === "pending") {
    return (
      <div className="apanel">
        <AuthBrand />
        <div className="stcard pending" data-testid="st-pending">
          <span className="st-ic status-art" style={{ background: "var(--banana-tint)", color: "var(--banana-deep)" }}><Icon name="hourglass" /></span>
          <h2 className="center">You&apos;re on the list</h2>
          <p className="sub center">We&apos;ll email you as soon as your workspace is ready — usually within one business day.</p>
          <div className="tline">
            <div className="done"><span className="dot"><Icon name="check" size="xs" /></span><span><b>Request received</b><small>{received}</small></span></div>
            <div className="cur"><span className="dot"><Icon name="clock" size="xs" /></span><span><b>Review by our team</b><small>Usually within 24 hours</small></span></div>
            <div><span className="dot">3</span><span><b>Connect WhatsApp &amp; go live</b><small>About 5 minutes</small></span></div>
          </div>
          <div className="locknote"><Icon name="lock" size="sm" />Your workspace stays locked until approval — nothing to set up yet.</div>
        </div>
      </div>
    );
  }
  if (st.status === "approved") {
    return (
      <div className="apanel">
        <AuthBrand />
        <div className="stcard approved" data-testid="st-approved">
          <span className="st-ic status-art" style={{ background: "var(--chat-tint)", color: "var(--chat-deep)" }}><Icon name="seal-check" /></span>
          <h2 className="center">You&apos;re in! 🎉</h2>
          <p className="sub center">Your workspace is ready. Next: connect your WhatsApp number.</p>
          <button className="btn btn-primary btn-lg btn-full" onClick={() => { router.replace("/"); router.refresh(); }}>Enter workspace<Icon name="arrow-right" /></button>
        </div>
      </div>
    );
  }
  return (
    <div className="apanel">
      <AuthBrand />
      <div className="stcard rejected" data-testid="st-rejected">
        <span className="st-ic status-art" style={{ background: "var(--sunken)", color: "var(--ink-2)" }}><Icon name="envelope-simple-open" /></span>
        <h2 className="center">Not quite yet</h2>
        <p className="sub center">We can&apos;t open messaging for this request right now.</p>
        <div className="note"><Icon name="info" /><span><b>Reason:</b> {st.rejectReason ?? "this use case is outside what we support in early access"}. Reply to the review email if you think this is a mistake.</span></div>
        <a className="btn btn-soft btn-lg btn-full" href="/request-access">Update my request</a>
      </div>
    </div>
  );
}
