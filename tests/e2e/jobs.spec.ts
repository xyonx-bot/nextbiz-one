import { expect, test } from "@playwright/test";
import { Pool } from "pg";

/** Background jobs: a job left "running" by a crash is picked up again; a broadcast reaches everyone, not only the first 250. */
const DB = process.env.DATABASE_URL ?? "";
if (DB.includes("one-db:5432") || DB.includes("one.nextbizstudio.com")) { console.error("[PROD GUARD] aborted."); process.exit(0); }
const pool = new Pool({ connectionString: DB });
const T = Date.now(), WS = `e2e jobs ${T}`;

test.afterAll(async () => { await pool.query(`DELETE FROM workspaces WHERE name = $1`, [WS]); await pool.end(); });

test("a job stuck since a crash is run again", async () => {
  test.setTimeout(90_000);
  const id = (await pool.query(`INSERT INTO jobs (type, status, attempts, updated_at) VALUES ('template_status_poll', 'running', 1, now() - interval '4 days') RETURNING id`)).rows[0].id;
  await expect.poll(async () => (await pool.query(`SELECT status FROM jobs WHERE id = $1`, [id])).rows[0].status, { timeout: 70_000 }).toBe("done");
});

test("a broadcast to 620 people reaches all of them once (demo number — nothing is sent to Meta)", async () => {
  test.setTimeout(120_000);
  const ws = (await pool.query(`INSERT INTO workspaces (name) VALUES ($1) RETURNING id`, [WS])).rows[0].id;
  await pool.query(`INSERT INTO waba_connections (workspace_id, phone_number_id, display_name, status) VALUES ($1, $2, 'Demo', 'connected')`, [ws, `demo-wa-${T}`]);
  const tpl = (await pool.query(`INSERT INTO templates (workspace_id, name, body, status) VALUES ($1, 't', 'Hi {{1}}', 'approved') RETURNING id`, [ws])).rows[0].id;
  const bc = (await pool.query(`INSERT INTO broadcasts (workspace_id, template_id, name, status) VALUES ($1, $2, 'big', 'scheduled') RETURNING id`, [ws, tpl])).rows[0].id;
  await pool.query(`WITH c AS (INSERT INTO contacts (workspace_id, wa_id, name, opt_in) SELECT $1, '9100' || lpad(g::text, 8, '0'), 'P' || g, true FROM generate_series(1, 620) g RETURNING id)
    INSERT INTO broadcast_recipients (broadcast_id, contact_id) SELECT $2, id FROM c`, [ws, bc]);
  await pool.query(`INSERT INTO jobs (workspace_id, type, payload) VALUES ($1, 'broadcast_send', $2::jsonb)`, [ws, JSON.stringify({ broadcastId: bc })]);
  await expect.poll(async () => (await pool.query(`SELECT status FROM broadcasts WHERE id = $1`, [bc])).rows[0].status, { timeout: 100_000 }).toBe("done");
  const r = (await pool.query(`SELECT count(*)::int AS n, count(DISTINCT wa_message_id)::int AS ids, count(*) FILTER (WHERE status IN ('queued','failed') OR error_raw IS NOT NULL)::int AS bad FROM broadcast_recipients WHERE broadcast_id = $1`, [bc])).rows[0];
  expect(r).toEqual({ n: 620, ids: 620, bad: 0 });
});
