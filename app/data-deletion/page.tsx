import type { Metadata } from "next";
import { PublicPage, type Section } from "@/components/PublicPage";
import { Icon } from "@/components/Icon";
import { getPool } from "@/lib/db";

export const metadata: Metadata = { title: "Data deletion — NextBiz One", description: "How to delete your data from NextBiz One, and check the status of a deletion request." };
export const dynamic = "force-dynamic";

/**
 * Meta "Data Deletion Instructions URL" + the status page our deletion callback returns (?code=…).
 */
async function lookup(code: string) {
  if (!/^[A-F0-9]{6,20}$/.test(code)) return null;
  const r = await getPool().query(`SELECT code, source, status, detail, created_at, completed_at FROM data_deletion_requests WHERE code = $1`, [code]).catch(() => null);
  return r?.rows[0] ?? null;
}
const when = (d: string | Date) => new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) + " IST";

const sections: Section[] = [
  { id: "what", title: "What gets deleted", body: <ul>
    <li>Your workspace and every user in it.</li>
    <li>Contacts, conversations and messages, comments, templates, broadcasts and their reports, automations and AI history.</li>
    <li>Connected-account access tokens for WhatsApp, Instagram and your ad account.</li>
  </ul> },
  { id: "meta", title: "What stays on Meta", body: <p>Deleting your NextBiz data doesn&rsquo;t delete anything on Meta&rsquo;s side. Your WhatsApp number, Instagram account, Facebook Page, ad account and campaigns stay yours, and you manage them in Meta&rsquo;s own tools. Backups containing your data are overwritten within 30 days.</p> },
  { id: "customers", title: "If you're a customer of a business", body: <p>If you messaged a business that uses NextBiz One and want your messages deleted, ask that business first, because they control their customer data. You can also email <a href="mailto:privacy@nextbizstudio.com">privacy@nextbizstudio.com</a> with the business name and your phone number or Instagram username, and we&rsquo;ll work with them to delete it.</p> },
];

export default async function DataDeletionPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;
  const req = code ? await lookup(code.toUpperCase()) : null;
  return (
    <PublicPage eyebrow="Your data" title="Delete your data" art="/art/contacts.webp" sections={sections}
      intro="Three ways to remove your data from NextBiz One. Each one is permanent.">
      {code && (
        <div className={`lg-status${req && req.status !== "received" ? "" : " wait"}`} data-testid="deletion-status">
          <span className={`icon-tile ${req && req.status !== "received" ? "green" : "banana"}`}><Icon name={req ? (req.status === "received" ? "hourglass" : "check-circle") : "warning-circle"} /></span>
          <div>
            {req ? <>
              <b>{req.status === "completed" ? "Deletion completed" : req.status === "nothing_found" ? "Request processed — nothing to delete" : "Deletion in progress"}</b>
              <p>Confirmation code <code>{req.code}</code> · received {when(req.created_at)}{req.completed_at ? ` · finished ${when(req.completed_at)}` : ""}</p>
              {req.detail && <p>{req.detail}</p>}
            </> : <><b>We couldn&apos;t find that confirmation code</b><p>Check the code, or email <a href="mailto:privacy@nextbizstudio.com">privacy@nextbizstudio.com</a> and we&apos;ll look it up.</p></>}
          </div>
        </div>
      )}
      <div className="lg-steps">
        <div className="lg-step"><span className="k">1</span><b>Delete in the app</b><p>Settings → Your data → <b>Delete workspace</b>. Type your workspace name to confirm. Everything is removed straight away.</p></div>
        <div className="lg-step"><span className="k">2</span><b>Remove us on Facebook or Instagram</b><p>Facebook: Settings → Apps and websites → NextBiz One → Remove. Instagram: Settings → Website permissions → Apps and websites → Remove. Meta tells us, and we delete that account&rsquo;s data automatically.</p></div>
        <div className="lg-step"><span className="k">3</span><b>Email us</b><p>Write to <a href="mailto:privacy@nextbizstudio.com">privacy@nextbizstudio.com</a> from your account email. We confirm and finish within 30 days, usually much sooner.</p></div>
      </div>
    </PublicPage>
  );
}
