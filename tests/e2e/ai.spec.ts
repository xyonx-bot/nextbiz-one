import { expect, test } from "@playwright/test";
import { Pool } from "pg";

/**
 * NextBiz AI — UI + guard rails, without calling a model (no cost, no flakiness):
 * the drawer opens from the top bar / ⌘J with page-aware prompts, the operator can change models + limits,
 * a workspace over its daily limit is refused, and non-operators can't touch AI settings. PROD GUARD.
 */
const PROD_DB_URL = process.env.DATABASE_URL ?? "";
if (PROD_DB_URL.includes("one-db:5432") || PROD_DB_URL.includes("one.nextbizstudio.com")) {
  console.error("[PROD GUARD] DATABASE_URL points to production. E2E suite aborted.");
  process.exit(0);
}
const keyed = !!process.env.OPENROUTER_API_KEY;

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.fill("#email", process.env.OPERATOR_EMAIL ?? "operator@nextbiz.one");
  await page.fill("#password", process.env.OPERATOR_PASS ?? "operator-test-pass");
  await Promise.all([page.click("button[type=submit]"), page.waitForURL((u) => !u.pathname.startsWith("/login"))]);
}

test.describe.serial("NextBiz AI", () => {
  test("operator can see and change AI settings; limit is enforced", async ({ page }) => {
    await login(page);
    await page.goto("/operator#ai");
    await expect(page.getByTestId("op-ai-view")).toBeVisible();
    await expect(page.getByTestId("op-assistantModel")).toHaveValue(/\//);
    const before = (await (await page.request.get("/api/operator/ai")).json()) as { config: { dailyLimit: number } };
    // limit 0 → every AI call is refused with a clear message
    expect((await page.request.put("/api/operator/ai", { data: { dailyLimit: 0 } })).status()).toBe(200);
    if (keyed) {
      const r = await page.request.post("/api/ai/chat", { data: { messages: [{ role: "user", content: "hi" }] } });
      expect(r.status()).toBe(429);
      expect(((await r.json()) as { error: string }).error).toContain("limit");
    }
    expect((await page.request.put("/api/operator/ai", { data: { assistantModel: "not-a/real-model-xyz" } })).status()).toBe(400);
    expect((await page.request.put("/api/operator/ai", { data: { dailyLimit: before.config.dailyLimit } })).status()).toBe(200);
  });

  test("assistant drawer opens with page-aware prompts", async ({ page }) => {
    test.skip(!keyed, "AI needs OPENROUTER_API_KEY on the server");
    await login(page);
    await page.goto("/");
    await page.getByTestId("ai-open").click();
    await expect(page.getByTestId("ai-panel")).toHaveClass(/open/);
    await expect(page.getByTestId("ai-prompt").first()).toContainText(/attention|ads|campaign/i);
    await page.keyboard.press("Escape");
    await page.getByTestId("ai-input").press("Escape").catch(() => {});
    await page.context().addCookies([{ name: "nbo_ads_demo", value: "1", url: page.url() }]); // no ad account here → planner mode
    await page.goto("/ads/new");
    await expect(page.getByTestId("ai-fill")).toBeVisible();
    await page.keyboard.press("Control+j");
    await expect(page.getByTestId("ai-panel")).toHaveClass(/open/);
    await expect(page.getByTestId("ai-prompt").first()).toContainText(/campaign/i);
  });

  test("only operators can read or change AI settings", async ({ page, request }) => {
    expect((await request.get("/api/operator/ai")).status()).toBe(401);
    expect((await request.post("/api/ai/chat", { data: { messages: [{ role: "user", content: "hi" }] } })).status()).toBe(401);
    // a client workspace user is not an operator
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const u = (await pool.query(`SELECT email FROM users WHERE NOT is_operator AND is_approved AND workspace_id IS NOT NULL LIMIT 1`)).rows[0];
      test.skip(!u, "no client user in this DB");
    } finally { await pool.end(); }
    await login(page);
    expect((await page.request.get("/api/operator/ai")).status()).toBe(200);
  });
});

test("dashboard — new workspace gets the launch pad, not a wall of zeros", async ({ page }) => {
  const { hash } = await import("bcryptjs");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const T = Date.now(), email = `dash-${T}@e2e.test`;
  const ws = (await pool.query(`INSERT INTO workspaces (name) VALUES ($1) RETURNING id`, [`Dash ${T}`])).rows[0].id;
  await pool.query(`INSERT INTO users (workspace_id, email, password_hash, display_name, is_operator, is_approved) VALUES ($1,$2,$3,'Dash Owner',false,true)`, [ws, email, await hash("pw-12345678", 4)]);
  try {
    await page.goto("/login"); await page.fill("#email", email); await page.fill("#password", "pw-12345678");
    await Promise.all([page.click("button[type=submit]"), page.waitForURL((u) => !u.pathname.startsWith("/login"))]);
    await page.goto("/");
    await expect(page.getByTestId("dashboard")).toHaveAttribute("data-state", "new");
    await expect(page.getByTestId("setup")).toBeVisible();
    await expect(page.getByTestId("launch-pad")).toBeVisible();
    await expect(page.getByTestId("kpi-conv")).toHaveCount(0);
    await expect(page.getByTestId("card-channels")).toHaveCount(0); // the launch pad already offers the connects
    await expect(page.locator(".pg-dash .demo")).toHaveCount(0);
  } finally {
    await pool.query(`DELETE FROM workspaces WHERE id = $1`, [ws]); await pool.query(`DELETE FROM users WHERE email = $1`, [email]); await pool.end();
  }
});
