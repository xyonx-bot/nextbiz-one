import { getPool } from "./db";
import { ensureThread, igPrivateReply, igPublicReply, igSendDm, recordOutbound } from "./instagram";

/**
 * Instagram automation — same contract as WhatsApp (lib/automation.ts):
 *  · DMs: away message (outside business hours) → welcome (once per thread) → first matching keyword rule
 *    with on_instagram_dm. Inbound DMs are always inside Instagram's 24h window, so replies are allowed.
 *  · Comments: first matching keyword rule with on_instagram_comment sends a private reply (DM) to the
 *    commenter and, optionally, a public reply under the comment.
 *  · A person replying (from NextBiz One or the Instagram app) pauses automation for that thread.
 * Contains-match only, no AI (v1 lock). Never throws — inbound processing must not break.
 */

type Rule = { id: string; name: string; keywords: string[]; reply: string; send_once: boolean; comment_public_reply: string | null };

function inBusinessHours(hours: Record<string, [string, string]> | null): boolean {
  if (!hours || Object.keys(hours).length === 0) return true;
  const now = new Date();
  const day = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "Asia/Kolkata" }).format(now).slice(0, 3).toLowerCase();
  const hhmm = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata", hour12: false }).format(now);
  const range = hours[day];
  if (!range || !Array.isArray(range) || range.length !== 2) return false;
  return range[0] <= hhmm && hhmm <= range[1];
}

export function matchRule<T extends { keywords: string[] }>(rules: T[], text: string): T | null {
  const lower = text.toLowerCase();
  return rules.find((r) => (r.keywords ?? []).some((k) => k && k.trim() && lower.includes(k.trim().toLowerCase()))) ?? null;
}

async function log(wsId: string, type: string, ruleId: string | null, detail: string, status: string) {
  await getPool().query(
    `INSERT INTO automation_log (workspace_id, contact_id, type, rule_id, detail, status) VALUES ($1, NULL, $2, $3, $4, $5)`,
    [wsId, type, ruleId, `[instagram] ${detail}`.slice(0, 300), status],
  ).catch(() => {});
}

async function dm(wsId: string, acctId: string, threadId: string, igsid: string, text: string) {
  const s = await igSendDm(acctId, igsid, text);
  await recordOutbound(wsId, acctId, threadId, s.ok ? s.mid : `failed-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, text, "automation", s.ok ? "sent" : "failed", s.ok ? undefined : s.error);
  return s;
}

export async function igAutoReplyDm(wsId: string, acctId: string, threadId: string, text: string): Promise<void> {
  try {
    const p = getPool();
    const th = (await p.query(`SELECT igsid, automation_paused, welcome_sent_at FROM ig_threads WHERE id = $1`, [threadId])).rows[0];
    if (!th) return;
    if (th.automation_paused) { await log(wsId, "paused", null, "a person replied — automation stays quiet for this chat", "paused"); return; }
    const cfg = (await p.query(`SELECT * FROM automation_settings WHERE workspace_id = $1`, [wsId])).rows[0];

    if (cfg?.away_enabled && !inBusinessHours(cfg.business_hours)) {
      if (cfg.away_text) {
        const s = await dm(wsId, acctId, threadId, th.igsid, cfg.away_text);
        await log(wsId, "away", null, `away reply ${s.ok ? "sent" : s.error}`, s.ok ? "sent" : "failed");
      }
      return;
    }
    if (cfg?.welcome_enabled && !th.welcome_sent_at) {
      const s = await dm(wsId, acctId, threadId, th.igsid, cfg.welcome_text);
      if (s.ok) await p.query(`UPDATE ig_threads SET welcome_sent_at = now() WHERE id = $1`, [threadId]);
      await log(wsId, "welcome", null, `welcome ${s.ok ? "sent" : s.error}`, s.ok ? "sent" : "failed");
    }
    const rules = (await p.query(
      `SELECT id, name, keywords, reply, send_once, comment_public_reply FROM keyword_rules
        WHERE workspace_id = $1 AND enabled AND on_instagram_dm ORDER BY created_at`, [wsId])).rows as Rule[];
    const r = matchRule(rules, text);
    if (!r) return;
    if (r.send_once) {
      const sent = await p.query(`SELECT 1 FROM ig_messages WHERE thread_id = $1 AND origin = 'automation' AND status = 'sent' AND body = $2 LIMIT 1`, [threadId, r.reply]);
      if (sent.rows.length) { await log(wsId, "keyword", r.id, `rule "${r.name}" already answered this chat`, "skipped"); return; }
    }
    const s = await dm(wsId, acctId, threadId, th.igsid, r.reply);
    await p.query(`UPDATE keyword_rules SET fired_count = fired_count + 1, last_fired_at = now() WHERE id = $1`, [r.id]);
    await log(wsId, "keyword", r.id, `DM rule "${r.name}" ${s.ok ? "sent" : s.error}`, s.ok ? "sent" : "failed");
  } catch { /* never break inbound */ }
}

export async function igAutoReplyComment(wsId: string, acctId: string, commentId: string, text: string): Promise<void> {
  try {
    const p = getPool();
    const rules = (await p.query(
      `SELECT id, name, keywords, reply, send_once, comment_public_reply FROM keyword_rules
        WHERE workspace_id = $1 AND enabled AND on_instagram_comment ORDER BY created_at`, [wsId])).rows as Rule[];
    const r = matchRule(rules, text);
    if (!r) { await p.query(`UPDATE ig_comments SET handled_at = now(), dm_status = 'skipped', public_status = 'skipped' WHERE comment_id = $1`, [commentId]); return; }

    const pr = await igPrivateReply(acctId, commentId, r.reply);
    let pub: { ok: boolean; error?: string } = { ok: true };
    if (r.comment_public_reply?.trim()) pub = await igPublicReply(acctId, commentId, r.comment_public_reply.trim());
    await p.query(
      `UPDATE ig_comments SET rule_id = $2, dm_status = $3, public_status = $4, handled_at = now() WHERE comment_id = $1`,
      [commentId, r.id, pr.ok ? "sent" : "failed", r.comment_public_reply?.trim() ? (pub.ok ? "sent" : "failed") : "skipped"]);
    // the private reply opens a DM thread with the commenter — show it in the inbox
    const c = (await p.query(`SELECT from_id, from_name FROM ig_comments WHERE comment_id = $1`, [commentId])).rows[0];
    if (pr.ok && c?.from_id) {
      const th = await ensureThread(wsId, acctId, c.from_id, c.from_name ?? null);
      await recordOutbound(wsId, acctId, th.id, pr.mid, r.reply, "automation", "sent");
    }
    await p.query(`UPDATE keyword_rules SET fired_count = fired_count + 1, last_fired_at = now() WHERE id = $1`, [r.id]);
    await log(wsId, "comment", r.id, `comment rule "${r.name}": DM ${pr.ok ? "sent" : (pr as { error: string }).error}${r.comment_public_reply?.trim() ? `, public reply ${pub.ok ? "sent" : pub.error}` : ""}`, pr.ok ? "sent" : "failed");
  } catch { /* never break inbound */ }
}
