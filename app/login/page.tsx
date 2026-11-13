import { Suspense } from "react";
import { AuthLayout } from "@/components/AuthBrand";
import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return <AuthLayout><Suspense fallback={null}><LoginForm /></Suspense></AuthLayout>;
}
