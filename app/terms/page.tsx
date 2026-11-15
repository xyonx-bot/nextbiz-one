import type { Metadata } from "next";
import { PublicPage, type Section } from "@/components/PublicPage";

export const metadata: Metadata = { title: "Terms of Service — NextBiz One", description: "The terms for using NextBiz One." };

const sections: Section[] = [
  { id: "agree", title: "Agreeing to these terms", body: <p>These terms are an agreement between you (the business using NextBiz One) and NextBiz Studio. By creating a workspace or using the app, you accept them on behalf of your business. If you don&rsquo;t agree, please don&rsquo;t use the app.</p> },
  { id: "service", title: "The service", body: <>
    <p>NextBiz One connects your own WhatsApp Business number, Instagram professional account, Facebook Page and Meta ad account, so you can reply to customers, send approved templates and broadcasts, automate common replies and run ads from one place.</p>
    <p>We may add, change or remove features. If we remove something you rely on, we&rsquo;ll give reasonable notice where we can.</p></> },
  { id: "account", title: "Your account", body: <ul>
    <li>Give accurate details, keep your password private, and tell us about any unauthorised use.</li>
    <li>You&rsquo;re responsible for what happens in your workspace, including actions by people you give access to.</li>
    <li>We review new workspaces before activating them, and may decline any request.</li>
  </ul> },
  { id: "meta", title: "Meta platforms and your messages", body: <>
    <ul>
      <li>You must follow the <a href="https://www.whatsapp.com/legal/business-policy" target="_blank" rel="noreferrer">WhatsApp Business Policy</a>, the <a href="https://www.whatsapp.com/legal/commerce-policy" target="_blank" rel="noreferrer">WhatsApp Commerce Policy</a>, Instagram&rsquo;s and Meta&rsquo;s terms and advertising standards.</li>
      <li><b>Consent:</b> send marketing messages only to people who agreed to receive them. Don&rsquo;t import or message lists you don&rsquo;t have permission for.</li>
      <li>Meta decides which templates are approved, how quickly messages are delivered, your messaging limits and quality rating, and whether ads run. We aren&rsquo;t responsible for Meta&rsquo;s decisions or outages.</li>
    </ul>
    <div className="lg-note">Meta bills you directly for WhatsApp template messages and for ad spend. Those charges are between you and Meta.</div></> },
  { id: "use", title: "Acceptable use", body: <>
    <p>Don&rsquo;t use NextBiz One to:</p>
    <ul>
      <li>send spam, scams, or illegal, harmful or deceptive content;</li>
      <li>harass people, or message people who asked you to stop;</li>
      <li>break the law or anyone else&rsquo;s rights;</li>
      <li>try to access other workspaces, overload or reverse-engineer the service, or get around its limits.</li>
    </ul>
    <p>We may suspend a workspace that breaks these rules or puts other users or our Meta access at risk.</p></> },
  { id: "ai", title: "NextBiz AI", body: <p>AI suggestions can be wrong. Review them before you send or publish anything; you&rsquo;re responsible for what goes out. See the <a href="/privacy#ai">Privacy Policy</a> for how AI requests are processed.</p> },
  { id: "data", title: "Your data", body: <p>Your content stays yours. You give us permission to store and process it only to run the service for you, as described in our <a href="/privacy">Privacy Policy</a>. You can export it or delete your workspace at any time.</p> },
  { id: "fees", title: "Fees", body: <p>NextBiz One is currently offered in early access. If we introduce paid plans, we&rsquo;ll show the price and ask you to agree before you&rsquo;re charged anything.</p> },
  { id: "liability", title: "Warranty and liability", body: <>
    <p>The service is provided &ldquo;as is&rdquo;. We work hard to keep it reliable, but we don&rsquo;t promise it will be uninterrupted or error-free.</p>
    <p>To the extent the law allows, we aren&rsquo;t liable for indirect or consequential losses, lost profits, or the actions and outages of Meta and other third parties. Our total liability is limited to the amount you paid us in the 12 months before the claim.</p></> },
  { id: "end", title: "Ending the agreement", body: <p>You can stop using the app and delete your workspace at any time from Settings. We may end or suspend access for a serious or repeated breach of these terms, with notice where reasonable.</p> },
  { id: "law", title: "Law and contact", body: <p>These terms are governed by the laws of India. Questions: <a href="mailto:privacy@nextbizstudio.com">privacy@nextbizstudio.com</a>.</p> },
];

export default function TermsPage() {
  return <PublicPage eyebrow="Legal" title="Terms of Service" updated="15 November 2026" art="/art/templates.webp" sections={sections}
    intro="The rules for using NextBiz One: what we provide, what we expect from you, and how Meta's own policies fit in." />;
}
