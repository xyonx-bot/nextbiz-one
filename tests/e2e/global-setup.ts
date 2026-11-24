import { Pool } from "pg";

/**
 * E2E fixtures the suite assumes but nothing in the app creates:
 * the platform owner's own WhatsApp number (env PHONE_NUMBER_ID, "PNID" in tests)
 * is a *connected* waba_connections row of the default "NextBiz One" workspace.
 * Prod has that row; a fresh test DB does not, so every WhatsApp page showed
 * "not connected" and inbound test webhooks were stored raw instead of routed.
 *
 * Required env for the app under test (see .github/workflows/ci-cd.yml, e2e job):
 *   PHONE_NUMBER_ID=PNID  IG_APP_ID=<numeric>  IG_APP_SECRET=nbo-e2e-ig-secret
 *   IG_WEBHOOK_VERIFY_TOKEN=nbo-e2e-ig-verify  IG_LIVE unset/false
 */
export default async function globalSetup(): Promise<void> {
  const url = process.env.DATABASE_URL ?? "";
  if (!url) throw new Error("[e2e setup] DATABASE_URL is required");
  if (url.includes("one-db:5432") || url.includes("one.nextbizstudio.com")) {
    throw new Error("[PROD GUARD] DATABASE_URL points to production. E2E suite aborted.");
  }
  const pnid = process.env.PHONE_NUMBER_ID ?? "PNID";
  const pool = new Pool({ connectionString: url });
  try {
    const { rows } = await pool.query(
      `INSERT INTO workspaces (name) VALUES ('NextBiz One')
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    );
    await pool.query(
      `INSERT INTO waba_connections (workspace_id, phone_number_id, display_name, status)
       VALUES ($1, $2, 'E2E platform number', 'connected')
       ON CONFLICT (workspace_id, phone_number_id) DO UPDATE SET status = 'connected'`,
      [rows[0].id, pnid],
    );
  } finally {
    await pool.end();
  }
}
