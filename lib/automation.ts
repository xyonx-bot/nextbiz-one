import { getPool } from "./db";
import { getWaCreds, sendText } from "./wa-client";
import { handoffActive, isCommand } from "./handoff";

/**
 * P1.10 automation engine — contains-match only, case-insensitive, no regex/AI
 * (v1 lock). Fires ONLY on inbound (always inside the 24h window). Manual
 * human reply sets conversations.automation_paused(+_at) and automation goes quiet
 * for HANDOFF_HOURS (lib/handoff.ts), then resumes. START/STOP are always answered.
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

/** Automatic replies belong in the chat history too, so the inbox shows what the customer received. */
async function keep(p: ReturnType<typeof getPool>, wsId: string, convId: string, s: Awaited<ReturnType<typeof sendText>>, body: string, kind: string, rule?: string) {
  if (!s.ok) return;
  await p.query(
    `INSERT INTO messages (workspace_id, conversation_id, direction, wa_message_id, type, body, status, raw)
     VALUES ($1, $2, 'out', $3, 'text', $4, 'sent', $5::jsonb) ON CONFLICT DO NOTHING`,
    [wsId, convId, s.waMessageId, body, JSON.stringify({ automation: kind, ...(rule ? { rule } : {}) })]).catch(() => {});
}

/** Runs after an inbound message lands. Never throws (inbound must not break). */
export async function maybeAutoReply(
  wsId: string, contactId: string, convId: string, waId: string, text: string,
): Promise<void> {
  try {
    const p = getPool();
    const conv = await p.query(
      `SELECT automation_paused, automation_paused_at, welcome_sent_at FROM conversations WHERE id = $1`, [convId]);
    if (conv.rows.length === 0) return;
    const c0 = conv.rows[0];
    const handoff = handoffActive(c0.automation_paused, c0.automation_paused_at);
    const command = isCommand(text);
    if (handoff && !command) {
      await log(p, wsId, contactId, "paused", null, "you replied recently — automation stays quiet for this chat for a few hours", "paused");
      return;
    }
    if (c0.automation_paused && !handoff) {
      // handoff expired (or a legacy pause with no timestamp) → automation resumes
      await p.query(`UPDATE conversations SET automation_paused = false WHERE id = $1`, [convId]);
    }
    const st = await p.query(`SELECT * FROM automation_settings WHERE workspace_id = $1`, [wsId]);
    if (st.rows.length === 0) return;
    const cfg = st.rows[0];
    const creds = await getWaCreds(wsId);

    // START / STOP get their keyword reply only — no away or welcome stacked on top
    if (!command) {
      // away message wins when business is closed
      if (cfg.away_enabled && !inBusinessHours(cfg.business_hours)) {
        if (cfg.away_text) {
          const s = await sendText(creds, waId, cfg.away_text);
          await keep(p, wsId, convId, s, cfg.away_text, "away");
          await log(p, wsId, contactId, "away", null, `away reply: ${s.ok ? "sent" : s.error}`, s.ok ? "sent" : "failed");
        }
        return;
      }

      // welcome — once per conversation
      // claim it first, so two messages arriving together don't both send it
      if (cfg.welcome_enabled && !c0.welcome_sent_at
        && (await p.query(`UPDATE conversations SET welcome_sent_at = now() WHERE id = $1 AND welcome_sent_at IS NULL`, [convId])).rowCount) {
        const s = await sendText(creds, waId, cfg.welcome_text);
        await keep(p, wsId, convId, s, cfg.welcome_text, "welcome");
        if (!s.ok) await p.query(`UPDATE conversations SET welcome_sent_at = NULL WHERE id = $1`, [convId]);
        await log(p, wsId, contactId, "welcome", null, `welcome ${s.ok ? "sent" : s.error}`, s.ok ? "sent" : "failed");
      }
    }

    // keyword rules — first matching enabled rule fires, single reply
    const lower = text.toLowerCase();
    const rules = await p.query(
      `SELECT id, name, keywords, reply, send_once FROM keyword_rules
        WHERE workspace_id = $1 AND enabled AND on_whatsapp ORDER BY created_at`, [wsId]);
    for (const r of rules.rows) {
      const hit = (r.keywords as string[]).some((k) => k && k.trim() && lower.includes(k.trim().toLowerCase()));
      if (!hit) continue;
      if (r.send_once) {
        // "send at most once per conversation" — was stored but never enforced
        const prior = await p.query(
          `SELECT 1 FROM automation_log WHERE contact_id = $1 AND rule_id = $2 AND status = 'sent' LIMIT 1`, [contactId, r.id]);
        if (prior.rows.length) { await log(p, wsId, contactId, "keyword", r.id, `rule "${r.name}" already answered this chat`, "skipped"); return; }
      }
      const s = await sendText(creds, waId, r.reply);
      await keep(p, wsId, convId, s, r.reply, "keyword", r.name);
      if (s.ok && command && !c0.welcome_sent_at) await p.query(`UPDATE conversations SET welcome_sent_at = now() WHERE id = $1`, [convId]);
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
