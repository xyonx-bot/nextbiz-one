import { expect, test } from "@playwright/test";
import { Pool } from "pg";
import { hash } from "bcryptjs";
import { createHmac } from "crypto";

/** v1.10 launch readiness: public legal pages, password help, Meta data-deletion callback, login limits, 404. PROD GUARD. */
const DB = process.env.DATABASE_URL ?? "";
if (DB.includes("one-db:5432") || DB.includes("one.nextbizstudio.com")) { console.error("[PROD GUARD] E2E suite aborted."); process.exit(0); }
const T = Date.now(), EMAIL = `launch-${T}@e2e.test`, PASS = `launch-pass-${T}`;
let pool: Pool;

test.describe.serial("launch readiness", () => {
  test.beforeAll(async () => {
    pool = new Pool({ connectionString: DB });
    const ws = (await pool.query(`INSERT INTO workspaces (name) VALUES ($1) RETURNING id`, [`Launch ${T}`])).rows[0].id;
    await pool.query(`INSERT INTO users (workspace_id, email, password_hash, display_name, is_approved) VALUES ($1,$2,$3,'Launch Owner',true)`, [ws, EMAIL, await hash(PASS, 4)]);
  });
  test.afterAll(async () => {
    await pool.query(`DELETE FROM workspaces WHERE name = $1`, [`Launch ${T}`]).catch(() => {});
    await pool.query(`DELETE FROM users WHERE email = $1`, [EMAIL]).catch(() => {});
    await pool.end();
  });

  test("legal pages are public and styled", async ({ page }) => {
    for (const [path, h] of [["/privacy", "Privacy Policy"], ["/terms", "Terms of Service"], ["/data-deletion", "Delete your data"]] as const) {
      const r = await page.goto(path);
      expect(r?.status()).toBe(200);
      await expect(page.locator(".pg-legal h1")).toHaveText(h);
      await expect(page.locator(".lg-foot")).toContainText("Data deletion");
    }
    await page.goto("/privacy");
    await expect(page.locator("#ai")).toContainText("OpenRouter");
  });

  test("forgot → operator link → reset → log in with the new password", async ({ page, browser }) => {
    await page.goto("/login"); await page.getByTestId("forgot-link").click();
    await page.getByTestId("forgot-email").fill(EMAIL); await page.getByTestId("forgot-submit").click();
    await expect(page.getByTestId("forgot-done")).toBeVisible();
    // operator creates the one-time link
    const op = await browser.newPage();
    await op.goto("/login"); await op.fill("#email", process.env.OPERATOR_EMAIL!); await op.fill("#password", process.env.OPERATOR_PASS!);
    await Promise.all([op.click("button[type=submit]"), op.waitForURL((u) => !u.pathname.startsWith("/login"))]);
    const list = await (await op.request.get("/api/operator/password-resets")).json();
    const mine = list.resets.find((r: { email: string }) => r.email === EMAIL);
    expect(mine).toBeTruthy();
    const link = await (await op.request.post("/api/operator/password-resets", { data: { id: mine.id } })).json();
    await op.close();
    const url = new URL(link.url);
    await page.goto(url.pathname + url.search);
    await page.getByTestId("reset-pw").fill("brand-new-pass-1"); await page.getByTestId("reset-pw2").fill("brand-new-pass-1");
    await page.getByTestId("reset-submit").click();
    await expect(page.getByTestId("reset-done")).toBeVisible();
    // the link is single-use
    await page.goto(url.pathname + url.search); await expect(page.getByTestId("reset-invalid")).toBeVisible();
    await page.goto("/login"); await page.fill("#email", EMAIL); await page.fill("#password", "brand-new-pass-1");
    await Promise.all([page.click("button[type=submit]"), page.waitForURL((u) => !u.pathname.startsWith("/login"))]);
  });

  test("Meta data-deletion callback: verifies the signature, returns a status URL", async ({ request, page }) => {
    const secret = process.env.META_APP_SECRET;
    test.skip(!secret, "META_APP_SECRET not set for this run");
    const b64 = (b: Buffer) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const payload = b64(Buffer.from(JSON.stringify({ algorithm: "HMAC-SHA256", user_id: `9${T}`, issued_at: Math.floor(T / 1000) })));
    const sig = b64(createHmac("sha256", secret!).update(payload).digest());
    const bad = await request.post("/api/meta/data-deletion", { form: { signed_request: `${sig}x.${payload}` } });
    expect(bad.status()).toBe(400);
    const ok = await request.post("/api/meta/data-deletion", { form: { signed_request: `${sig}.${payload}` } });
    expect(ok.status()).toBe(200);
    const d = await ok.json();
    expect(d.confirmation_code).toMatch(/^[A-F0-9]{12}$/);
    const u = new URL(d.url); await page.goto(u.pathname + u.search);
    await expect(page.getByTestId("deletion-status")).toContainText(d.confirmation_code);
  });

  test("login: too many wrong passwords are slowed down", async ({ request }) => {
    const email = `nobody-${T}@e2e.test`;
    let last = 0;
    for (let i = 0; i < 11; i++) last = (await request.post("/api/auth/login", { data: { email, password: "wrong" } })).status();
    expect(last).toBe(429);
  });

  test("unknown pages show the friendly 404", async ({ page }) => {
    await page.goto("/login"); await page.fill("#email", process.env.OPERATOR_EMAIL!); await page.fill("#password", process.env.OPERATOR_PASS!);
    await Promise.all([page.click("button[type=submit]"), page.waitForURL((u) => !u.pathname.startsWith("/login"))]);
    const r = await page.goto("/this-does-not-exist");
    expect(r?.status()).toBe(404);
    await expect(page.getByTestId("not-found")).toBeVisible();
  });
});
