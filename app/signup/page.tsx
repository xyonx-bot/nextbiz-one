import { Suspense } from "react";
import { AuthLayout } from "@/components/AuthBrand";
import { SignupForm } from "./SignupForm";

/** P1.1 — Signup: account + access request in one. Gated until an operator approves. */
export default function SignupPage() {
  return <AuthLayout art="signup"><Suspense fallback={null}><SignupForm /></Suspense></AuthLayout>;
}
