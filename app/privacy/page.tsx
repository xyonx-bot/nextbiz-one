import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy Policy — NextBiz One" };

/**
 * Public privacy policy (Meta App Review requires a live Privacy Policy URL).
 * No app shell — standalone page outside the auth gate.
 * Last updated: 2026-11-08
 */
export default function PrivacyPage() {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "48px 20px", fontFamily: "system-ui, sans-serif", color: "#1A1D23", lineHeight: 1.6 }}>
      <h1 style={{ fontSize: 26, margin: "0 0 4px" }}>Privacy Policy</h1>
      <p style={{ color: "#5A5F6A", fontSize: 13, marginTop: 0 }}>NextBiz One · Last updated: 8 November 2026</p>

      <h2 style={{ fontSize: 17, marginTop: 32 }}>1. What we do</h2>
      <p style={{ fontSize: 14 }}>NextBiz One is a workspace for businesses to manage their own WhatsApp messages, Instagram direct messages and comments, and advertising campaigns. A business owner connects their own accounts (WhatsApp number, Instagram professional account, Facebook Page, ad account) through our app, and we only ever act on assets they explicitly connected.</p>

      <h2 style={{ fontSize: 17, marginTop: 28 }}>2. What we collect</h2>
      <p style={{ fontSize: 14 }}>Only data needed to run the connected accounts:</p>
      <ul style={{ fontSize: 14 }}>
        <li>Account identifiers and profile information of the connected assets (business name, phone number, Instagram username).</li>
        <li>Messages, comments and webhook events received on the connected accounts, so they can be shown in your dashboard and answered.</li>
        <li>Campaign data for ad accounts the owner connected (campaign names, budgets, performance metrics).</li>
        <li>Access tokens issued by Meta for the connected accounts — stored encrypted, never sold, never shared with third parties.</li>
      </ul>

      <h2 style={{ fontSize: 17, marginTop: 28 }}>3. How we use it</h2>
      <p style={{ fontSize: 14 }}>Solely to provide the features of the app: showing your messages and comments, sending replies you write, managing your campaigns, and displaying account status. We do not use your data for advertising, train models on your private messages, or share it with anyone outside the service.</p>

      <h2 style={{ fontSize: 17, marginTop: 28 }}>4. Meta platform data</h2>
      <p style={{ fontSize: 14 }}>We access Meta platform data (Instagram, WhatsApp, ads) only through official Meta APIs with the permissions you grant via Meta&rsquo;s own login screens. You can revoke access at any time from Meta&rsquo;s settings or by disconnecting the account in our app.</p>

      <h2 style={{ fontSize: 17, marginTop: 28 }}>5. Retention and deletion</h2>
      <p style={{ fontSize: 14 }}>We keep connected-account data while the account stays connected. Delete your workspace in Settings → Data at any time; contacts, conversations, templates and broadcasts are removed, and Meta-side assets (such as your WhatsApp number) are released as described in the app.</p>

      <h2 style={{ fontSize: 17, marginTop: 28 }}>6. Contact</h2>
      <p style={{ fontSize: 14 }}>Questions about this policy: <a href="mailto:privacy@nextbizstudio.com" style={{ color: "#FF7518" }}>privacy@nextbizstudio.com</a></p>

      <p style={{ fontSize: 12, color: "#5A5F6A", marginTop: 40, borderTop: "1px solid #E7E2D9", paddingTop: 14 }}>
        NextBiz One is a product of NextBiz Studio. This policy applies to the NextBiz One application (one.nextbizstudio.com).
      </p>
    </main>
  );
}
