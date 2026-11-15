/**
 * Morning summary: once a day (from 09:00 IST), each workspace with customers waiting for a reply
 * gets one email per owner who hasn't turned it off. "Waiting" = the newest message in a chat is
 * from the customer and is older than 30 minutes. Never sends when nothing is waiting.
 */
import { getPool } from "./db";
import { mailOn, sendMail } from "./mail";
import { digestEmail } from "./mail-templates";

const istNow = () => new Date(Date.now() + 5.5 * 3600_000); // UTC fields of this = IST wall clock

export async function waitingChats(wsId: string): Promise<{ n: number; oldestHours: number; names: string[] }> {
  const p = getPool();
  const wa = (await p.query(
    `SELECT COALESCE(ct.name, '+' || ct.wa_id) AS who, lm.created_at
       FROM conversations c JOIN contacts ct ON ct.id = c.contact_id
       JOIN LATERAL (SELECT direction, created_at FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) lm ON true
      WHERE c.workspace_id = $1 AND lm.direction = 'in' AND lm.created_at < now() - interval '30 minutes' AND lm.created_at > now() - interval '14 days'`, [wsId])).rows;
  const ig = (await p.query(
    `SELECT COALESCE('@' || t.username, t.name, 'Instagram user') AS who, lm.created_at
       FROM ig_threads t
       JOIN LATERAL (SELECT direction, created_at FROM ig_messages m WHERE m.thread_id = t.id ORDER BY m.created_at DESC LIMIT 1) lm ON true
      WHERE t.workspace_id = $1 AND lm.direction = 'in' AND lm.created_at < now() - interval '30 minutes' AND lm.created_at > now() - interval '14 days'`, [wsId]).catch(() => ({ rows: [] }))).rows;
  const all = [...wa, ...ig].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
  return { n: all.length, oldestHours: all.length ? Math.max(1, Math.round((Date.now() - +new Date(all[0].created_at)) / 3600_000)) : 0, names: all.slice(-3).reverse().map((r) => String(r.who)) };
}

export async function runDigests(force = false): Promise<number> {
  if (!mailOn()) return 0;
  const ist = istNow(), hour = ist.getUTCHours(), today = ist.toISOString().slice(0, 10);
  if (!force && (hour < 9 || hour >= 11)) return 0;
  const p = getPool();
  const wss = (await p.query(`SELECT id, name FROM workspaces WHERE COALESCE(revoked, false) = false AND (digest_sent_on IS NULL OR digest_sent_on < $1::date)`, [today])).rows;
  let sent = 0;
  for (const w of wss) {
    // claim the day first, so two workers never double-send
    const claim = await p.query(`UPDATE workspaces SET digest_sent_on = $2::date WHERE id = $1 AND (digest_sent_on IS NULL OR digest_sent_on < $2::date)`, [w.id, today]);
    if (!claim.rowCount) continue;
    const d = await waitingChats(w.id);
    if (!d.n) continue;
    const users = (await p.query(`SELECT email FROM users WHERE workspace_id = $1 AND is_approved AND email_digest`, [w.id])).rows;
    for (const u of users) { const r = await sendMail(digestEmail(u.email, { workspace: w.name, waiting: d.n, oldestHours: d.oldestHours, names: d.names })); if (r.ok) sent++; }
  }
  if (sent) console.log(`[mail] morning summaries sent: ${sent}`);
  return sent;
}
