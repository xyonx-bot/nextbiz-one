import { getPool } from "@/lib/db";
import { sendText, pollTemplates } from "@/lib/wa-client";

/** S2 in-app scheduler (plan D2 — no Redis). Single-container worker tick. */

async function runBroadcastSend(payload: { broadcastId: string }) {
  const p = getPool();
  const b = await p.query(
    `SELECT b.*, t.body AS tpl_body, t.status AS tpl_status, t.name AS tpl_name
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
  await p.query(`UPDATE broadcasts SET status='sending' WHERE id=$1`, [bc.id]);

  // remaining queued recipients (opt-in snapshotted at create time)
  const rcpt = await p.query(
    `SELECT r.id, r.contact_id, c.wa_id, c.first_name
       FROM broadcast_recipients r JOIN contacts c ON c.id = r.contact_id
      WHERE r.broadcast_id = $1 AND r.status = 'queued' LIMIT 250`,
    [bc.id],
  );
  for (const r of rcpt.rows) {
    const body = bc.tpl_body.replace(/\{\{1\}\}/g, r.first_name || "there");
    try {
      const res = await sendText(r.wa_id, body);
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

async function runTemplateStatusPoll() {
  const poll = await pollTemplates();
  if (!poll.ok) throw new Error(poll.error);
  const p = getPool();
  for (const t of poll.templates) {
    await p.query(
      `UPDATE templates SET status=$2, rejection_reason=$3, updated_at=now()
        WHERE meta_name=$1 AND status <> $2`,
      [t.metaName, t.status, t.rejectedReason ?? null],
    );
  }
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
}
