import { getPool } from "@/lib/db";
import { getWaCreds, pollTemplates, sendTemplate } from "@/lib/wa-client";

/** S2 in-app scheduler (plan D2 — no Redis). Single-container worker tick. */

async function runBroadcastSend(payload: { broadcastId: string }) {
  const p = getPool();
  const b = await p.query(
    `SELECT b.*, t.body AS tpl_body, t.status AS tpl_status, t.name AS tpl_name, t.meta_name AS tpl_meta, t.language AS tpl_lang
       FROM broadcasts b JOIN templates t ON t.id = b.template_id
      WHERE b.id = $1 FOR UPDATE OF b`,
    [payload.broadcastId],
  );
  if (b.rows.length === 0) throw new Error("broadcast not found");
  const bc = b.rows[0];
  if (bc.status === "done" || bc.status === "cancelled") return;
  if (bc.tpl_status !== "approved") {
    throw new Error(`template ${bc.tpl_name} is ${bc.tpl_status} — broadcast blocked`);
  }
  const creds = await getWaCreds(bc.workspace_id);
  if (!creds) throw new Error("WhatsApp isn't connected for this workspace — broadcast blocked");
  await p.query(`UPDATE broadcasts SET status='sending' WHERE id=$1`, [bc.id]);
  const varCount = new Set((bc.tpl_body.match(/\{\{\d+\}\}/g) ?? []) as string[]).size;

  // remaining queued recipients (opt-in snapshotted at create time)
  const rcpt = await p.query(
    `SELECT r.id, r.contact_id, c.wa_id, c.name
       FROM broadcast_recipients r JOIN contacts c ON c.id = r.contact_id
      WHERE r.broadcast_id = $1 AND r.status = 'queued' LIMIT 250`,
    [bc.id],
  );
  for (const r of rcpt.rows) {
    // real template message (plain text is only delivered inside the 24h window): {{1}} = first name
    const first = String(r.name || "there").split(" ")[0];
    const params = Array.from({ length: varCount }, (_, k) => (k === 0 ? first : "-"));
    try {
      const res = await sendTemplate(creds, r.wa_id, { metaName: bc.tpl_meta || bc.tpl_name, language: bc.tpl_lang || "en", params });
      if (res.ok) {
        await p.query(
          `UPDATE broadcast_recipients SET status='sent', wa_message_id=$2, sent_at=now() WHERE id=$1`,
          [r.id, res.waMessageId ?? null],
        );
      } else {
        await p.query(
          `UPDATE broadcast_recipients SET status='failed', error_raw=$2 WHERE id=$1`,
          [r.id, String(res.error ?? "send failed")],
        );
      }
    } catch (e) {
      await p.query(`UPDATE broadcast_recipients SET status='failed', error_raw=$2 WHERE id=$1`, [r.id, String(e)]);
    }
  }
  const left = await p.query(`SELECT count(*)::int AS n FROM broadcast_recipients WHERE broadcast_id=$1 AND status='queued'`, [bc.id]);
  if (left.rows[0].n === 0) {
    await p.query(`UPDATE broadcasts SET status='done', sent_at=now() WHERE id=$1`, [bc.id]);
  }
}

/** Poll Meta for template review results — every connected workspace, its own templates only. */
export async function runTemplateStatusPoll(onlyWs?: string): Promise<number> {
  const p = getPool();
  const wss = onlyWs ? [onlyWs] : (await p.query(`SELECT DISTINCT workspace_id FROM waba_connections WHERE status = 'connected'`)).rows.map((r) => r.workspace_id as string);
  let updated = 0;
  for (const ws of wss) {
    const poll = await pollTemplates(await getWaCreds(ws));
    if (!poll.ok) continue;
    for (const t of poll.templates) {
      const r = await p.query(
        `UPDATE templates SET status=$3, rejection_reason=$4, updated_at=now()
          WHERE workspace_id=$1 AND meta_name=$2 AND status <> $3`,
        [ws, t.metaName, t.status, t.rejectedReason ?? null],
      );
      updated += r.rowCount ?? 0;
    }
  }
  return updated;
}

/** Claim + run one due job. Returns true if a job ran (for drain-on-start). */
export async function tick(): Promise<boolean> {
  const p = getPool();
  const claimed = await p.query(
    `UPDATE jobs SET status='running', attempts=attempts+1, updated_at=now()
      WHERE id IN (SELECT id FROM jobs WHERE status='queued' AND run_at <= now()
                   ORDER BY run_at LIMIT 1 FOR UPDATE SKIP LOCKED)
      RETURNING *`,
  );
  if (claimed.rows.length === 0) return false;
  const j = claimed.rows[0];
  try {
    if (j.type === "broadcast_send") await runBroadcastSend(j.payload);
    else if (j.type === "template_status_poll") await runTemplateStatusPoll();
    await p.query(`UPDATE jobs SET status='done', updated_at=now() WHERE id=$1`, [j.id]);
  } catch (e) {
    const msg = String(e).slice(0, 500);
    const retry = j.attempts < 3;
    await p.query(
      `UPDATE jobs SET status=$2, last_error=$3, run_at=now() + interval '30 seconds', updated_at=now() WHERE id=$1`,
      [j.id, retry ? "queued" : "failed", msg],
    );
    if (!retry) {
      await p.query(`UPDATE broadcasts SET status='failed' WHERE id=$1`, [j.payload.broadcastId]).catch(() => {});
    }
  }
  return true;
}

let started = false;
export function startWorker() {
  if (started || process.env.JOBS_DISABLED === "1") return;
  started = true;
  const loop = async () => { try { while (await tick()) { /* drain */ } } catch { /* next tick */ } };
  void loop();
  setInterval(() => void loop(), 30_000).unref();
  // recurring poll job every 10 min (idempotent re-arm)
  const armPoll = () => getPool().query(
    `INSERT INTO jobs (type, payload, run_at)
     SELECT 'template_status_poll', '{}'::jsonb, now()
      WHERE NOT EXISTS (SELECT 1 FROM jobs WHERE type='template_status_poll' AND status IN ('queued','running'))`,
  ).catch(() => {});
  void armPoll();
  setInterval(() => void armPoll(), 600_000).unref();
  // Instagram long-lived tokens last 60 days — refresh the ones expiring within 15 days, every 6h
  const igRefresh = () => import("./instagram").then((m) => m.refreshIgTokens(15)).then((r) => { if (r.refreshed || r.failed) console.log(`[ig] token refresh: ${r.refreshed} refreshed, ${r.failed} failed`); }).catch(() => {});
  void igRefresh();
  setInterval(() => void igRefresh(), 6 * 3600_000).unref();
  // Instagram comments: pull from the API every 5 min (webhooks alone miss comments before App Review)
  const igSync = () => import("./ig-sync").then((m) => m.syncAllIgComments()).catch(() => {});
  setTimeout(() => void igSync(), 30_000).unref();
  setInterval(() => void igSync(), 5 * 60_000).unref();
}
