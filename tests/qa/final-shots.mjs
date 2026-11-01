import { chromium } from "@playwright/test";
const BASE = "https://one.nextbizstudio.com";
const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(BASE + "/login");
await ctx.request.post(BASE + "/api/auth/login", {
  data: { email: process.env.OPERATOR_EMAIL, password: process.env.OPERATOR_PASS },
});
await page.goto(BASE + "/templates", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
const row = page.locator("[data-testid=trow]").first();
if (await row.count()) { await row.click(); await page.waitForTimeout(800); }
await page.screenshot({ path: "test-results/sweep/live-templates-sel.png" });
await page.goto(BASE + "/", { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
await page.screenshot({ path: "test-results/sweep/live-dashboard.png" });
await page.goto(BASE + "/contacts", { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
const krow = page.locator("[data-testid=krow]").first();
if (await krow.count()) { await krow.click(); await page.waitForTimeout(600); }
await page.screenshot({ path: "test-results/sweep/live-contacts-sel.png" });
await browser.close();
console.log("shots done");
