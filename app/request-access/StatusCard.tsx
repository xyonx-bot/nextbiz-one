"use client";

import { useRouter } from "next/navigation";
import { AuthBrand } from "../../components/AuthBrand";

/**
 * The three status states — wireframe shows them stacked for review;
 * production renders exactly ONE per account (auth wireframe contract).
 * Markup ported 1:1 from the auth wireframe: .stcard.pending/approved/rejected
 * + .st-ic icon tile + locknote with lock icon, with the brand block (fix A)
 * above the card on every state.
 */
export type ReqStatus = {
  status: "pending" | "approved" | "rejected";
  businessName: string;
  received: string;
  rejectReason: string | null;
};

const IC = "https://cdn.joyverse.fun/mira-assets/phosphor/bold/";

export function StatusCard({ st }: { st: ReqStatus }) {
  const router = useRouter();
  const received = new Date(st.received).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  if (st.status === "pending") {
    return (
      <div className="authwrap">
        <AuthBrand />
        <div className="stcard pending" data-testid="st-pending">
          <span className="st-ic"><img src={`${IC}hourglass-bold.svg`} alt="" /></span>
          <h2>Request pending</h2>
          <p>We received your request on <b>{received}</b>. We'll email you the moment it's reviewed — usually within one business day.</p>
          <div className="locknote"><img src={`${IC}lock-bold.svg`} alt="" />Workspace stays locked until approval. Nothing to set up yet.</div>
        </div>
      </div>
    );
  }

  if (st.status === "approved") {
    return (
      <div className="authwrap">
        <AuthBrand />
        <div className="stcard approved" data-testid="st-approved">
          <span className="st-ic"><img src={`${IC}check-bold.svg`} alt="" /></span>
          <h2>Approved — welcome aboard</h2>
          <p>Your workspace is ready. Connect your WhatsApp number to start messaging customers.</p>
          <button className="btn btn-chat abtn" onClick={() => { router.replace("/"); router.refresh(); }}>
            <img src={`${IC}arrow-right-bold.svg`} alt="" />Enter workspace →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="authwrap">
      <AuthBrand />
      <div className="stcard rejected" data-testid="st-rejected">
        <span className="st-ic"><img src={`${IC}x-bold.svg`} alt="" /></span>
        <h2>Not approved yet</h2>
        <p>We can't open messaging for <b>&ldquo;{st.rejectReason ?? "outside supported use cases"}&rdquo;</b> — it falls outside our supported use cases in early access. Reply to the review email if you think this is a mistake, or adjust your described use and re-request.</p>
        <div className="alinks" style={{ justifyContent: "center" }}>
          <span className="addlink">Contact support</span>
          <span style={{ width: 12 }} />
          <a className="addlink" href="/request-access" style={{ color: "var(--chat-deep)" }}>Edit request & re-submit</a>
        </div>
      </div>
    </div>
  );
}
