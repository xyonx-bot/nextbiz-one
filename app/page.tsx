import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { Shell } from "@/components/Shell";

export const dynamic = "force-dynamic";

/**
 * S0 dashboard placeholder — the shell is the deliverable (Mira's v4.3);
 * the dashboard surface itself lands in S1 per the locked build order.
 * The content zone states that plainly instead of self-designing filler.
 */
export default async function HomePage() {
  const token = (await cookies()).get("nbo_session")?.value;
  const user = await getSessionUser(token);
  const initials = (user?.displayName ?? "NBO")
    .split(/\s+/)
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <Shell active="dashboard" userInitials={initials} userName={user?.displayName ?? "Operator"}>
      <main className="pagezone" style={{ flex: 1, minHeight: 0, display: "grid", placeItems: "center", padding: "12px" }}>
        <div className="authcard" style={{ maxWidth: 420, width: "100%", textAlign: "center" }}>
          <h1>NextBiz One</h1>
          <p className="lede">S0 foundation is live — auth gate, webhook, shell v4.3.</p>
          <p className="ahint">
            The dashboard surface ships in S1 (Mira's wireframe is ready).
            S0 acceptance: send "hi" from the connected WhatsApp number and it lands in the messages table.
          </p>
        </div>
      </main>
    </Shell>
  );
}
