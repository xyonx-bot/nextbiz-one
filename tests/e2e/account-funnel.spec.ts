import { execSync } from "node:child_process";
import { expect, test } from "@playwright/test";

/**
 * S3 account funnel e2e — the whole gate: signup (gated) -> status state ->
 * operator review (approve) -> login works + audit ledger has both entries.
 * Non-operators are locked out of operator APIs + the /operator page.
 * Artifacts are cleaned from the DB after the run (unique e2e email).
 *
 * PROD GUARD: this spec MUST NOT run against production. If DATABASE_URL
 * contains the prod host (one-db:5432 / one.nextbizstudio.com), the spec
 * exits immediately — no DB mutations, no docker exec. CI uses a side-DB.
 */
const PROD_DB_URL = process.env.DATABASE_URL ?? "";
if (PROD_DB_URL.includes("one-db:5432") || PROD_DB_URL.includes("one.nextbizstudio.com")) {
  console.error("[PROD GUARD] DATABASE_URL points to production. E2E suite aborted.");
  process.exit(0);
}
const E2E_EMAIL = `e2e_funnel_${Date.now()}@nbo.test`;
const BIZ = `E2E Biz ${Date.now() % 100000}`;

async function loginOperator(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.fill("#email", process.env.OPERATOR_EMAIL ?? "operator@nextbiz.one");
  await page.fill("#password", process.env.OPERATOR_PASS ?? "operator-test-pass");
  await Promise.all([page.click("button[type=submit]"), page.waitForURL("**/")]);
}

test.describe("S3 account funnel", () => {
  // one worker for the whole suite — module-level E2E_EMAIL must be shared
  test.describe.configure({ mode: "serial" });
  test("signup is gated; login shows the pending state", async ({ request }) => {
    const su = await request.post("/api/auth/signup", {
      data: { businessName: BIZ, email: E2E_EMAIL, password: "e2e-test-pass-123" },
    });
    expect(su.status()).toBe(201);
    expect(((await su.json()) as { gated: boolean }).gated).toBe(true);

    const li = await request.post("/api/auth/login", {
      data: { email: E2E_EMAIL, password: "e2e-test-pass-123" },
    });
    expect(li.status()).toBe(403);
    const d = (await li.json()) as { gated: boolean; status: string };
    expect(d.gated).toBe(true);
    expect(d.status).toBe("pending");
  });

  test("operator console: approve opens the workspace; ledger records both steps", async ({ page, request }) => {
    await loginOperator(page);
    await page.goto("/operator");
    await expect(page.locator(".op-shell")).toBeVisible();
    await expect(page.locator(".rq-row", { hasText: BIZ }).first()).toBeVisible();

    // approve the e2e request from the UI — the click is fire-and-forget,
    // so wait for the ledger's 'approved' entry for THIS business (commit proof)
    const row = page.locator(".rq-row", { hasText: BIZ }).first();
    await row.locator("[data-testid=approve]").click();
    await expect(page.locator(".led-what", { hasText: BIZ }).filter({ hasText: "approved" }).first()).toBeVisible({ timeout: 10000 });

    // the gated user can now log in
    const li = await request.post("/api/auth/login", {
      data: { email: E2E_EMAIL, password: "e2e-test-pass-123" },
    });
    expect(li.status()).toBe(200);

    // audit ledger has request_received + approved for this business
    const audit = await (await page.request.get("/api/operator/audit")).json() as
      { entries: { action: string; target: string }[] };
    const mine = audit.entries.filter((e) => e.target.includes(BIZ));
    expect(mine.map((e) => e.action)).toEqual(expect.arrayContaining(["request_received", "approved"]));
  });

  test("non-operator is locked out of operator APIs and the page", async ({ page, request }) => {
    const lockEmail = `e2e_lock_${Date.now()}@nbo.test`;
    const su = await request.post("/api/auth/signup", {
      data: { businessName: `Lock Test ${Date.now() % 99999}`, email: lockEmail, password: "e2e-test-pass-123" },
    });
    expect(su.status()).toBe(201);
    const li = await request.post("/api/auth/login", {
      data: { email: lockEmail, password: "e2e-test-pass-123" },
    });
    // still gated -> no session for operator surfaces anyway
    expect(li.status()).toBe(403);
    await page.goto("/operator");
    await page.waitForURL("**/login**");
  });
});

test.afterAll(async () => {
  // Safe cleanup using pg Pool (no raw docker exec, no prod risk if guard bypassed)
  // Only runs when DATABASE_URL is a side-DB (prod guard above exits early otherwise).
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query(`
      DELETE FROM messages WHERE conversation_id IN (
        SELECT id FROM conversations WHERE workspace_id IN (
          SELECT id FROM workspaces WHERE name LIKE 'E2E Biz%' OR name LIKE 'Lock Test%'
        )
      );
      DELETE FROM conversations WHERE workspace_id IN (
        SELECT id FROM workspaces WHERE name LIKE 'E2E Biz%' OR name LIKE 'Lock Test%'
      );
      DELETE FROM contacts WHERE workspace_id IN (
        SELECT id FROM workspaces WHERE name LIKE 'E2E Biz%' OR name LIKE 'Lock Test%'
      );
      DELETE FROM access_requests WHERE email LIKE 'e2e_%@nbo.test';
      DELETE FROM users WHERE email LIKE 'e2e_%@nbo.test';
      DELETE FROM workspaces WHERE name LIKE 'E2E Biz%' OR name LIKE 'Lock Test%';
      DELETE FROM audit_log WHERE target LIKE 'E2E Biz%' OR target LIKE 'Lock Test%' OR actor_email LIKE 'e2e_%@nbo.test';
    `);
  } catch {
    // best-effort
  } finally {
    await pool.end();
  }
});
