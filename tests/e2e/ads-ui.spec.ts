import { expect, test } from "@playwright/test";

/**
 * Ads UI e2e (P2.1–P2.3 + dashboard mount) — ported surfaces:
 * /ads table + detail drawer, /ads/new one-page create (design v2), /ads/performance, dashboard mount.
 * Mock-badged per the Meta audit contract (badge-mock must be present on every
 * ads surface). PROD GUARD like ads.spec.ts.
 */
const PROD_DB_URL = process.env.DATABASE_URL ?? "";
if (PROD_DB_URL.includes("one-db:5432") || PROD_DB_URL.includes("one.nextbizstudio.com")) {
  console.error("[PROD GUARD] DATABASE_URL points to production. E2E suite aborted.");
  process.exit(0);
}

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.fill("#email", process.env.OPERATOR_EMAIL ?? "operator@nextbiz.one");
  await page.fill("#password", process.env.OPERATOR_PASS ?? "operator-test-pass");
  await Promise.all([page.click("button[type=submit]"), page.waitForURL("**/")]);
}

const T = Date.now();

test.describe("Ads UI (design v2)", () => {
  test("/ads — status pills with counts, demo banner, rows, detail drawer is read-only for demo", async ({ page }) => {
    await login(page);
    await page.goto("/ads");
    await expect(page.getByTestId("ads-campaigns")).toBeVisible();
    for (const p of ["all", "ACTIVE", "PAUSED", "IN_REVIEW", "DRAFT"]) await expect(page.getByTestId(`pill-${p}`)).toBeVisible();
    await expect(page.locator(".banner")).toContainText("demo data");
    const demo = page.locator('.crow[data-testid^="crow-demo-"]').first();
    await expect(demo).toBeVisible();
    await demo.click();
    await expect(page.getByTestId("insights-wells")).toBeVisible();
    await expect(page.locator(".drawer.open")).toContainText("read-only");
    await page.keyboard.press("Escape");
  });

  test("/ads/new — validation, live preview, submit → In review", async ({ page }) => {
    await login(page);
    await page.goto("/ads/new");
    await expect(page.getByTestId("ads-wizard")).toBeVisible();
    await page.getByTestId("wiz-submit").click();
    await expect(page.getByTestId("wizard-error")).toContainText("name");
    await page.getByTestId("f-name").fill(`e2e_ui_${T}`);
    await page.getByTestId("obj-OUTCOME_ENGAGEMENT").click();
    await page.getByTestId("f-audience").fill("Kolkata 25-45");
    await expect(page.getByTestId("cnt-audience")).toHaveText("13 / 200");
    await page.getByTestId("f-budget").fill("0");
    await page.getByTestId("wiz-submit").click();
    await expect(page.getByTestId("wizard-error")).toContainText("budget");
    await page.getByTestId("f-budget").fill("1500");
    await page.getByTestId("f-headline").fill("Websites from 9999");
    await expect(page.getByTestId("pv-headline")).toHaveText("Websites from 9999");
    await expect(page.getByTestId("cnt-headline")).toHaveText("18 / 40");
    await page.getByTestId("dest-whatsapp").click();
    await page.getByTestId("wiz-submit").click();
    await page.waitForURL("**/ads?status=IN_REVIEW");
    await expect(page.getByTestId("pill-IN_REVIEW")).toHaveClass(/on/);
    await expect(page.locator(".crow", { hasText: `e2e_ui_${T}` })).toBeVisible();
  });

  test("draft path — save draft lands in Drafts; cancel from the drawer", async ({ page }) => {
    await login(page);
    await page.goto("/ads/new");
    await page.getByTestId("f-name").fill(`e2e_ui_draft_${T}`);
    await page.getByTestId("wiz-draft").click();
    await page.waitForURL("**/ads?status=DRAFT");
    const row = page.locator(".crow", { hasText: `e2e_ui_draft_${T}` });
    await expect(row).toBeVisible();
    await row.click();
    await page.locator(".drawer.open").getByRole("button", { name: "Cancel campaign" }).click();
    await page.getByTestId("pill-all").click();
    await expect(page.locator(".crow", { hasText: `e2e_ui_draft_${T}` }).locator(".pill")).toHaveText("Cancelled");
  });

  test("/ads/performance — KPIs, range switch, chart, by-campaign table", async ({ page }) => {
    await login(page);
    await page.goto("/ads/performance");
    await expect(page.getByTestId("ads-performance")).toBeVisible();
    await expect(page.locator(".kp b").first()).toContainText("₹");
    await page.getByTestId("range-30d").click();
    await expect(page.getByTestId("range-30d")).toHaveClass(/on/);
    await expect(page.locator("svg[role=img]")).toBeVisible();
    await expect(page.locator(".dt tbody tr").first()).toBeVisible();
  });

  test("dashboard mount — ads card with demo badge on /", async ({ page }) => {
    await login(page);
    await page.goto("/");
    await expect(page.locator(".card.ads .demo")).toBeVisible();
  });
});

test.afterAll(async () => {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try { await pool.query(`DELETE FROM ads_mock_campaigns WHERE name LIKE 'e2e_ui_%'`); } finally { await pool.end(); }
});
