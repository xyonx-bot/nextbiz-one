import { Suspense } from "react";
import { AuthLayout } from "@/components/AuthBrand";
import { RequestForm } from "./RequestForm";

/** P1.2 — the gate: intake form (no account needed) → pending state. */
export default function RequestAccessPage() {
  return <AuthLayout art="request"><Suspense fallback={null}><RequestForm /></Suspense></AuthLayout>;
}
