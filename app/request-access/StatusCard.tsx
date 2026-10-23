"use client";

import { useRouter } from "next/navigation";

/** The three status states — wireframe shows them stacked for review;
 * production renders exactly ONE per account (auth wireframe contract). */
export type ReqStatus = {
  status: "pending" | "approved" | "rejected";
  businessName: string;
  received: string;
  rejectReason: string | null;
};

export function StatusCard({ st }: { st: ReqStatus }) {
  const router = useRouter();
  if (st.status === "pending") {
    return (
      <div className="authwrap">
        <div className="stcard warn-card" data-testid="st-pending">
          <img src="https://cdn.joyverse.fun/mira-assets/phosphor/bold/hourglass-bold.svg" alt="" className="stile" />
          <div>
            <h1>Request pending</h1>
            <p className="lede">received {new Date(st.received).toLocaleDateString(undefined, { month: "short", day: "numeric" })} — we'll email {""}
               <b>{st.businessName}</b> when reviewed.</p>
            <div className="locknote">Workspace stays locked until approval. Nothing to set up yet.</div>
          </div>
        </div>
      </div>
    );
  }
  if (st.status === "approved") {
    return (
      <div className="authwrap">
        <div className="stcard ok-card" data-testid="st-approved">
          <img src="https://cdn.joyverse.fun/mira-assets/phosphor/bold/check-circle-bold.svg" alt="" className="stile" />
          <div>
            <h1>Approved — welcome aboard</h1>
            <p className="lede">Your workspace is ready.</p>
            <button className="btn btn-chat abtn" onClick={() => { router.replace("/"); router.refresh(); }}>
              <img src="https://cdn.joyverse.fun/mira-assets/phosphor/bold/arrow-right-bold.svg" alt="" />Enter workspace →
            </button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="authwrap">
      <div className="stcard bad-card" data-testid="st-rejected">
        <img src="https://cdn.joyverse.fun/mira-assets/phosphor/bold/x-circle-bold.svg" alt="" className="stile" />
        <div>
          <h1>Not approved yet</h1>
          <p className="lede">“{st.rejectReason ?? "outside supported use cases"}”</p>
          <div className="alinks" style={{ marginTop: 10 }}>
            <span className="addlink">Contact support</span>
            <a className="addlink" href="/request-access" style={{ color: "var(--chat-deep)" }}>Edit request & re-submit</a>
          </div>
        </div>
      </div>
    </div>
  );
}
