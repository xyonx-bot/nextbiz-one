import { getPool } from "./db";
import { sendText } from "./wa-client";

/**
 * P1.10 automation engine — contains-match only, case-insensitive, no regex/AI
 * (v1 lock). Fires ONLY on inbound (always inside the 24h window). Manual
 * human reply sets conversations.automation_paused and everything goes quiet.
 */

function inBusinessHours(hours: Record<string, [string, string]> | null): boolean {
  if (!hours || Object.keys(hours).length === 0) return true; // no hours set = always open
  const now = new Date();
  const day = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "Asia/Kolkata" })
    .format(now).slice(0, 3).toLowerCase(); // mon..sun
  const hhmm = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata", hour12: false }).format(now);
  const range = hours[day];
  if (!range || !Array.isArray(range) || range.length !== 2) return false; // closed
  return range[0] <= hhmm && hhmm <= range[1];
}

async function log(p: ReturnType<typeof getPool>, wsId: string, contactId: string | null, type: string, ruleId: string | null, detail: string, status: string) {
  await p.query(
    `INSERT INTO automation_log (workspace_id, contact_id, type, rule_id, detail, status)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [wsId, contactId, type, ruleId, detail.slice(0, 300), status],
  ).catch(() => {});
}

/** Runs after an inbound message lands. Never throws (inbound must not break). */
export async function maybeAutoReply(
  wsId: string, contactId: string, convId: string, waId: string, text: string,
): Promise<void> {
  try {
    const p = getPool();
    const conv = await p.query(
      `SELECT automation_paused, welcome_sent_at FROM conversations WHERE id = $1`, [convId]);
    if (conv.rows.length === 0) return;
    if (conv.rows[0].automation_paused) {
      await log(p, wsId, contactId, "paused", null, "human replied first — automation stays quiet for this chat", "paused");
      return;
    }
    const st = await p.query(`SELECT * FROM automation_settings WHERE workspace_id = $1`, [wsId]);
    if (st.rows.length === 0) return;
    const cfg = st.rows[0];

    // away message wins when business is closed
    if (cfg.away_enabled && !inBusinessHours(cfg.business_hours)) {
      if (cfg.away_text) {
        const s = await sendText(waId, cfg.away_text);
        await log(p, wsId, contactId, "away", null, `away reply: ${s.ok ? "sent" : s.error}`, s.ok ? "sent" : "failed");
      }
      return;
    }

    // welcome — once per conversation
    if (cfg.welcome_enabled && !conv.rows[0].welcome_sent_at) {
      const s = await sendText(waId, cfg.welcome_text);
      if (s.ok) await p.query(`UPDATE conversations SET welcome_sent_at = now() WHERE id = $1`, [convId]);
      await log(p, wsId, contactId, "welcome", null, `welcome ${s.ok ? "sent" : s.error}`, s.ok ? "sent" : "failed");
    }

    // keyword rules — first matching enabled rule fires, single reply
    const lower = text.toLowerCase();
    const rules = await p.query(
      `SELECT id, name, keywords, reply, send_once FROM keyword_rules
        WHERE workspace_id = $1 AND enabled ORDER BY created_at`, [wsId]);
    for (const r of rules.rows) {
      const hit = (r.keywords as string[]).some((k) => k && k.trim() && lower.includes(k.trim().toLowerCase()));
      if (!hit) continue;
      const s = await sendText(waId, r.reply);
      await p.query(
        `UPDATE keyword_rules SET fired_count = fired_count + 1, last_fired_at = now() WHERE id = $1`, [r.id]);
      await log(p, wsId, contactId, "keyword", r.id, `rule "${r.name}" ${s.ok ? "sent" : s.error}`, s.ok ? "sent" : "failed");
      return; // one rule, one reply — no stacking
    }
  } catch {
    // inbound pipeline must never break on automation
  }
}

/** Rule tester (inspector Test) — pure match, never sends. */
export function testMatch(rules: { id: string; name: string; keywords: string[] }[], text: string) {
  const lower = text.toLowerCase();
  for (const r of rules) {
    const kw = (r.keywords || []).find((k) => k && k.trim() && lower.includes(k.trim().toLowerCase()));
    if (kw) return { matched: true, rule: r.name, keyword: kw };
  }
  return { matched: false, rule: null, keyword: null };
}
