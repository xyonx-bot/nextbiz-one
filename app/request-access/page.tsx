import { Suspense } from "react";
import { RequestForm } from "./RequestForm";

/** P1.2 — the gate: intake form (no account needed) → pending state. */
export default function RequestAccessPage() {
  return <div className="authbg"><Suspense fallback={null}><RequestForm /></Suspense></div>;
}
