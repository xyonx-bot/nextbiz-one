import type { Metadata } from "next";
import { AuthLayout } from "@/components/AuthBrand";
import { ForgotForm } from "./ForgotForm";

export const metadata: Metadata = { title: "Reset your password — NextBiz One" };
export default function ForgotPage() { return <AuthLayout><ForgotForm /></AuthLayout>; }
