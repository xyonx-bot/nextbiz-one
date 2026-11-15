import { getPool } from "./db";
import { queueMail } from "./mail";
import { newRequestOperatorEmail, requestReceivedEmail } from "./mail-templates";

/** Operator inboxes: OPERATOR_EMAIL plus every operator account (deduped). */
export async function operatorEmails(): Promise<string[]> {
  const rows = (await getPool().query(`SELECT email FROM users WHERE is_operator`).catch(() => ({ rows: [] }))).rows as { email: string }[];
  return [...new Set([process.env.OPERATOR_EMAIL ?? "", ...rows.map((r) => r.email)].map((e) => e.trim().toLowerCase()).filter((e) => e.includes("@")))];
}
/** A new access request: thank the applicant, ping the operators. */
export async function notifyNewRequest(r: { business: string; email: string; use: string }) {
  queueMail(requestReceivedEmail(r.email, r.business));
  for (const op of await operatorEmails()) queueMail(newRequestOperatorEmail(op, r));
}
