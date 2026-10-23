import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { OnboardingClient } from "./OnboardingClient";

export const dynamic = "force-dynamic";

/** P1.4 — first-run wizard. Standalone full-screen (NO app shell). */
export default async function OnboardingPage() {
  const token = (await cookies()).get("nbo_session")?.value;
  const user = await getSessionUser(token);
  if (!user) redirect("/login?next=/onboarding");
  return <OnboardingClient />;
}
