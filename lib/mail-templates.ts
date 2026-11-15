/**
 * Branded transactional emails. Table layout + inline styles so Gmail, Outlook and phone mail apps
 * all render them the same. Every email also has a plain-text version.
 */
import type { Mail } from "./mail";

const BASE = () => process.env.PUBLIC_URL ?? "https://one.nextbizstudio.com";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

type Block = { heading: string; lead: string; paras?: string[]; button?: { label: string; url: string }; after?: string; art?: string; note?: string };

function layout(b: Block, preheader: string): string {
  const base = BASE();
  const p = (t: string) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#545862">${t}</p>`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(b.heading)}</title></head>
<body style="margin:0;padding:0;background:#F7F3EB;font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1A1D23">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F3EB"><tr><td align="center" style="padding:28px 14px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
    <tr><td style="padding:0 6px 16px"><a href="${base}" style="text-decoration:none;color:#1A1D23;font-weight:800;font-size:17px;letter-spacing:-.02em"><img src="${base}/logo.png" width="28" height="28" alt="" style="vertical-align:middle;margin-right:8px;border:0">NextBiz One</a></td></tr>
    <tr><td style="background:#FFFFFF;border:1px solid #EAE3D6;border-radius:20px;padding:30px 30px 26px">
      ${b.art ? `<img src="${base}/art/mail/${b.art}.png" width="96" height="96" alt="" style="display:block;margin:0 0 10px;border:0">` : ""}
      <h1 style="margin:0 0 10px;font-size:23px;line-height:1.25;letter-spacing:-.02em;color:#1A1D23">${esc(b.heading)}</h1>
      ${p(b.lead)}
      ${(b.paras ?? []).map(p).join("")}
      ${b.button ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 16px"><tr><td style="border-radius:12px;background:#91C82B"><a href="${b.button.url}" style="display:inline-block;padding:13px 22px;font-size:15px;font-weight:800;color:#1A1D23;text-decoration:none;border-radius:12px">${esc(b.button.label)}</a></td></tr></table>
      <p style="margin:0 0 14px;font-size:12px;line-height:1.5;color:#8C8F97">Button not working? Paste this into your browser:<br><a href="${b.button.url}" style="color:#4A7308;word-break:break-all">${b.button.url}</a></p>` : ""}
      ${b.after ? p(b.after) : ""}
      ${b.note ? `<div style="margin-top:6px;padding:12px 14px;border-radius:12px;background:#F7F3EB;font-size:13px;line-height:1.55;color:#545862">${b.note}</div>` : ""}
    </td></tr>
    <tr><td style="padding:16px 8px;font-size:12px;line-height:1.6;color:#8C8F97;text-align:center">
      NextBiz One · WhatsApp, Instagram &amp; Meta Ads in one inbox<br>
      <a href="${base}/privacy" style="color:#8C8F97">Privacy</a> · <a href="${base}/terms" style="color:#8C8F97">Terms</a> · Questions? Just reply to this email.
    </td></tr>
  </table>
</td></tr></table></body></html>`;
}
const text = (b: Block) => [b.heading, "", b.lead, ...(b.paras ?? []).map((x) => x.replace(/<[^>]+>/g, "")), b.button ? `\n${b.button.label}: ${b.button.url}` : "", b.after ? b.after.replace(/<[^>]+>/g, "") : "", b.note ? `\n${b.note.replace(/<[^>]+>/g, "")}` : "", "\n— NextBiz One"].filter((x) => x !== "").join("\n");
const mail = (to: string, kind: Mail["kind"], subject: string, b: Block, pre: string): Mail => ({ to, kind, subject, html: layout(b, pre), text: text(b) });

export const resetEmail = (to: string, url: string) => mail(to, "reset", "Reset your NextBiz One password", {
  heading: "Set a new password", art: "request-pending",
  lead: "Someone (hopefully you) asked to reset the password for this NextBiz One account.",
  button: { label: "Choose a new password", url },
  after: "The link works once, for 24 hours. Setting a new password signs you out on every device.",
  note: "Didn't ask for this? Ignore this email — your password stays the same.",
}, "Your reset link is inside — it works for 24 hours.");

export const requestReceivedEmail = (to: string, business: string) => mail(to, "request_received", "We got your NextBiz One request", {
  heading: "You're on the list", art: "request-pending",
  lead: `Thanks for asking for early access for <b>${esc(business)}</b>. We review every request by hand, usually within one business day.`,
  paras: ["We'll email you here as soon as your workspace is ready. Then you can connect WhatsApp and Instagram and start answering customers from one inbox."],
}, "We review every request by hand — usually within one business day.");

export const newRequestOperatorEmail = (to: string, r: { business: string; email: string; use: string }) => mail(to, "request_new", `New access request: ${r.business}`, {
  heading: `New request from ${r.business}`,
  lead: `<b>${esc(r.email)}</b> asked for access.`,
  paras: [`“${esc(r.use.slice(0, 400))}”`],
  button: { label: "Review in Operator", url: `${BASE()}/operator#requests` },
}, `${r.email} asked for access.`);

export const approvedEmail = (to: string, business: string, hasAccount: boolean) => mail(to, "approved", `Your NextBiz One workspace is ready`, {
  heading: `Welcome, ${business}!`, art: "launch",
  lead: hasAccount ? "Your workspace is approved and ready. Log in to connect WhatsApp and Instagram — it takes a few minutes." : "Your request is approved. Create your account with this email address and your workspace is ready straight away.",
  button: hasAccount ? { label: "Log in to NextBiz One", url: `${BASE()}/login?email=${encodeURIComponent(to)}` } : { label: "Create your account", url: `${BASE()}/signup?email=${encodeURIComponent(to)}&business=${encodeURIComponent(business)}` },
  paras: [],
  after: "First steps: connect your WhatsApp Business number, send yourself a “Hi” to see it arrive, and switch on a welcome message.",
}, "Your workspace is approved — here's how to start.");

export const rejectedEmail = (to: string, business: string, reason: string) => mail(to, "rejected", "About your NextBiz One request", {
  heading: "We can't approve this request yet",
  lead: `Thanks for your interest in NextBiz One for <b>${esc(business)}</b>. We couldn't approve it this time.`,
  note: `<b>Why:</b> ${esc(reason)}`,
  after: "If something has changed, or we got it wrong, just reply to this email and we'll take another look.",
}, "Reply to this email if anything has changed.");

export const digestEmail = (to: string, d: { workspace: string; waiting: number; oldestHours: number; names: string[] }) => mail(to, "digest",
  `${d.waiting} customer${d.waiting === 1 ? " is" : "s are"} waiting for a reply`, {
  heading: `${d.waiting} chat${d.waiting === 1 ? "" : "s"} waiting in ${d.workspace}`, art: "inbox",
  lead: `${d.names.length ? `${d.names.slice(0, 3).map(esc).join(", ")}${d.waiting > 3 ? ` and ${d.waiting - 3} more` : ""} wrote` : "Customers wrote"} and haven't had a reply yet. The longest has waited about ${d.oldestHours < 24 ? `${d.oldestHours} hour${d.oldestHours === 1 ? "" : "s"}` : `${Math.round(d.oldestHours / 24)} day${Math.round(d.oldestHours / 24) === 1 ? "" : "s"}`}.`,
  paras: ["On WhatsApp you can reply freely for 24 hours after their last message; after that you'll need an approved template."],
  button: { label: "Open the inbox", url: `${BASE()}/inbox` },
  note: `You get this at most once a day, only when chats are waiting. <a href="${BASE()}/settings#notifications" style="color:#4A7308">Turn it off</a> in Settings.`,
}, "A quick nudge — customers are waiting.");

export const testEmail = (to: string) => mail(to, "test", "NextBiz One test email ✓", {
  heading: "Email is working", art: "automation",
  lead: "This is a test from Operator → Email. Password resets, approval notices and morning summaries will now be sent automatically.",
}, "Email delivery from NextBiz One works.");
