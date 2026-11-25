import type { Metadata } from "next";
import { PublicPage, type Section } from "@/components/PublicPage";

export const metadata: Metadata = { title: "Privacy Policy — NextBiz One", description: "How NextBiz One collects, uses, shares and deletes data, including data from Meta platforms." };

/** Public privacy policy (Meta App Review requires a live Privacy Policy URL). Outside the auth gate. */
const UPDATED = "25 November 2026";

const sections: Section[] = [
  { id: "who", title: "Who we are", body: <>
    <p>NextBiz One (&ldquo;the app&rdquo;, at one.nextbizstudio.com) is made by <b>NextBiz Studio</b>. It gives a business one workspace for its WhatsApp Business messages, Instagram direct messages and comments, and Meta ad campaigns.</p>
    <p>For the data of your customers, <b>you (the business) are the controller</b> and we act as your processor. For your own account data (your name, email and login), we are the controller.</p></> },
  { id: "collect", title: "What we collect", body: <>
    <ul>
      <li><b>Your account:</b> name, work email, a hashed password, business name, and the devices you&rsquo;re signed in on.</li>
      <li><b>Connected accounts:</b> identifiers and profile details of the WhatsApp number, Instagram professional account, Facebook Page and ad account you connect (for example display name, username and profile picture).</li>
      <li><b>Messages and comments:</b> the messages, comments, media references and delivery statuses that Meta sends us for the accounts you connected, and the replies you send.</li>
      <li><b>Contacts you add:</b> names, phone numbers, tags and opt-in status that you enter, import, or that arrive when a customer messages you.</li>
      <li><b>Ads:</b> campaign settings, creative you upload and performance figures for ad accounts you connect.</li>
      <li><b>Access tokens</b> issued by Meta for the connected accounts, stored encrypted (AES-256-GCM).</li>
    </ul></> },
  { id: "use", title: "How we use it", body: <>
    <p>Only to provide the app: showing your conversations and comments, sending the replies, templates and broadcasts you choose, running the automatic replies you switch on, building and reporting on your campaigns, and keeping the service secure.</p>
    <p>We do <b>not</b> sell data, use it for our own advertising, or build profiles of your customers.</p></> },
  { id: "meta", title: "Data from Meta platforms", body: <>
    <p>We access WhatsApp, Instagram, Facebook and Meta ads data only through Meta&rsquo;s official APIs, with the permissions you grant on Meta&rsquo;s own login screens, and only for the assets you select. We use that data solely to show it to you and to act on your instructions inside the app, and we comply with the Meta Platform Terms and Developer Policies.</p>
    <p>You can revoke access at any time: disconnect the account in <b>Connections</b>, or remove NextBiz One in your Facebook or Instagram settings under Apps and Websites.</p></> },
  { id: "ai", title: "NextBiz AI (optional)", body: <>
    <p>NextBiz AI suggests replies, answers questions about your workspace and drafts campaign settings. It only runs when you, or a teammate, use it. When it runs, the text it needs (for example the open conversation, or your question) is sent to our AI provider <b>OpenRouter</b>, which routes it to the selected model provider to generate a response.</p>
    <p>We don&rsquo;t use your data to train our own models. Suggestions are never sent to a customer without a person approving them. Your workspace can ask us to switch AI off entirely.</p></> },
  { id: "share", title: "Who we share it with", body: <>
    <p>Only service providers that run the app for us, under contract and only for that purpose:</p>
    <div className="lg-tbl-wrap"><table className="lg-tbl"><thead><tr><th>Provider</th><th>What for</th></tr></thead><tbody>
      <tr><td>Meta Platforms</td><td>Delivering WhatsApp and Instagram messages, comments and ads, on your instruction</td></tr>
      <tr><td>Our cloud hosting provider</td><td>Servers and encrypted database storage</td></tr>
      <tr><td>Cloudflare</td><td>Network security and delivery</td></tr>
      <tr><td>OpenRouter and the selected model provider</td><td>NextBiz AI, only when used</td></tr>
    </tbody></table></div>
    <p>We may also disclose data if the law requires it.</p></> },
  { id: "keep", title: "How long we keep it", body: <>
    <p>We keep workspace data while your account is active. When you delete your workspace (Settings → Your data), its contacts, conversations, templates, broadcasts, automations and connected-account tokens are deleted. Backups roll over within 30 days.</p>
    <p>If you disconnect a single channel, we delete its access token and stop receiving its messages straight away. Its history stays in your workspace, hidden for Instagram, until you reconnect it or delete it. Delete a disconnected Instagram account&rsquo;s chats, messages and comments any time in <b>Connections</b>.</p></> },
  { id: "rights", title: "Your choices and rights", body: <>
    <ul>
      <li><b>Export:</b> download your contacts, conversations and broadcast reports as CSV from Settings → Your data.</li>
      <li><b>Delete:</b> delete your workspace in Settings, or follow the steps on our <a href="/data-deletion">data deletion page</a>.</li>
      <li><b>Correct or ask:</b> email <a href="mailto:privacy@nextbizstudio.com">privacy@nextbizstudio.com</a>. We reply within 30 days.</li>
    </ul>
    <p>Customers of a business using NextBiz One should contact that business first, since the business decides how their messages are handled. We will help the business respond.</p></> },
  { id: "security", title: "Security", body: <>
    <p>Encrypted connections (HTTPS) everywhere, encrypted storage for Meta tokens, hashed passwords, each workspace&rsquo;s data separated from every other workspace, limits on repeated login attempts, and a review step before new workspaces are activated. No system is perfect: if a breach affects your data, we will tell you without undue delay.</p></> },
  { id: "kids", title: "Children", body: <p>The app is for businesses and isn&rsquo;t directed at anyone under 18.</p> },
  { id: "changes", title: "Changes and contact", body: <>
    <p>If we change this policy in a way that matters, we&rsquo;ll show a notice in the app before it takes effect. Questions: <a href="mailto:privacy@nextbizstudio.com">privacy@nextbizstudio.com</a>.</p></> },
];

export default function PrivacyPage() {
  return <PublicPage eyebrow="Legal" title="Privacy Policy" updated={UPDATED} art="/art/request-pending.webp" sections={sections}
    intro="What NextBiz One collects, why, who processes it, and how you can export or delete it — in plain words." />;
}
