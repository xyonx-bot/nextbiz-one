/**
 * Outgoing email. Provider is chosen by what the server has:
 *   RESEND_API_KEY            → Resend HTTP API
 *   SMTP_URL                  → any SMTP service (smtps://user:pass@smtp.host:465, smtp://…:587)
 *   neither                   → nothing is sent; the attempt is logged as "skipped" so flows fall back
 * MAIL_FROM sets the sender ("NextBiz One <hello@nextbizstudio.com>"); MAIL_REPLY_TO an optional reply address.
 * Every attempt lands in email_log (Operator → Email shows it).
 */
import { getPool } from "./db";

export type MailKind = "reset" | "request_received" | "request_new" | "approved" | "rejected" | "digest" | "test";
export type Mail = { to: string; subject: string; html: string; text: string; kind: MailKind };
export type MailResult = { ok: true; id: string | null } | { ok: false; skipped?: boolean; error: string };

export function mailProvider(): "resend" | "smtp" | "none" {
  if (process.env.RESEND_API_KEY) return "resend";
  if (process.env.SMTP_URL) return "smtp";
  return "none";
}
export const mailOn = () => mailProvider() !== "none";
const FROM = () => process.env.MAIL_FROM || "NextBiz One <hello@nextbizstudio.com>";

async function viaResend(m: Mail): Promise<MailResult> {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM(), to: [m.to], subject: m.subject, html: m.html, text: m.text, ...(process.env.MAIL_REPLY_TO ? { reply_to: process.env.MAIL_REPLY_TO } : {}), tags: [{ name: "kind", value: m.kind }] }),
    signal: AbortSignal.timeout(15000),
  }).catch((e: Error) => ({ ok: false, status: 0, json: async () => ({ message: e.message }) }) as unknown as Response);
  const d = (await r.json().catch(() => null)) as { id?: string; message?: string } | null;
  return r.ok && d?.id ? { ok: true, id: d.id } : { ok: false, error: d?.message ?? `Resend error ${r.status}` };
}

let smtp: import("nodemailer").Transporter | null = null;
async function viaSmtp(m: Mail): Promise<MailResult> {
  try {
    if (!smtp) { const nm = await import("nodemailer"); smtp = nm.createTransport(process.env.SMTP_URL!, { connectionTimeout: 15000 } as never); }
    const info = await smtp.sendMail({ from: FROM(), to: m.to, subject: m.subject, html: m.html, text: m.text, replyTo: process.env.MAIL_REPLY_TO || undefined });
    return { ok: true, id: info.messageId ?? null };
  } catch (e) { smtp = null; return { ok: false, error: (e as Error).message }; }
}

export async function sendMail(m: Mail): Promise<MailResult> {
  const provider = mailProvider();
  const res: MailResult = provider === "resend" ? await viaResend(m) : provider === "smtp" ? await viaSmtp(m) : { ok: false, skipped: true, error: "Email isn't set up on this server" };
  await getPool().query(
    `INSERT INTO email_log (to_email, kind, subject, status, provider, provider_id, error) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [m.to, m.kind, m.subject, res.ok ? "sent" : "skipped" in res && res.skipped ? "skipped" : "failed", provider, res.ok ? res.id : null, res.ok ? null : res.error.slice(0, 500)],
  ).catch(() => {});
  if (!res.ok && !("skipped" in res && res.skipped)) console.error(`[mail] ${m.kind} to ${m.to.replace(/^(.).*@/, "$1•••@")} failed: ${res.error}`);
  return res;
}

/** Fire-and-forget for request handlers: never let email slow down or break the user's action. */
export function queueMail(m: Mail) { void sendMail(m).catch(() => {}); }
