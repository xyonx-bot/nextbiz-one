import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthLayout } from "@/components/AuthBrand";
import { ResetForm } from "./ResetForm";

export const metadata: Metadata = { title: "Set a new password — NextBiz One" };
export default function ResetPage() { return <AuthLayout><Suspense fallback={null}><ResetForm /></Suspense></AuthLayout>; }
