import { expect, test } from "@playwright/test";

/**
 * IG Business Login OAuth routes (r-nbo-ig-access-prep step 4).
 * The redirect URL registered in Meta App Dashboard is:
 *   https://<host>/api/auth/instagram/callback
 * Mock mode (IG_LIVE=false): callback never calls Graph, returns info page.
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

test.describe("IG business login OAuth", () => {
  test("start requires session (unauth -> /login), auth -> 302 to Meta dialog with our redirect_uri", async ({ page, request }) => {
    const anon = await request.get("/api/auth/instagram/start", { maxRedirects: 0 });
    expect([302, 307]).toContain(anon.status());
    expect(anon.headers()["location"]).toContain("/login");

    await login(page);
    const res = await page.request.get("/api/auth/instagram/start", { maxRedirects: 0 });
    expect([302, 307]).toContain(res.status());
    const loc = res.headers()["location"] ?? "";
    expect(loc.startsWith("https://www.facebook.com/v21.0/dialog/oauth?")).toBe(true);
    const q = new URL(loc).searchParams;
    expect(q.get("response_type")).toBe("code");
    expect(q.get("scope")).toContain("instagram_business_manage_messages");
    // redirect_uri points back at THIS host's callback (origin-derived or PUBLIC_URL)
    expect(q.get("redirect_uri")).toMatch(/\/api\/auth\/instagram\/callback$/);
    expect(q.get("state")).toBeTruthy();
    expect(res.headers()["set-cookie"]).toContain("ig_oauth_state=");
  });

  test("callback: no code -> 400; bad state -> 400; valid state + code in mock mode -> 200 mock page, no Graph", async ({ page }) => {
    await login(page);
    const noCode = await page.request.get("/api/auth/instagram/callback", { maxRedirects: 0 });
    expect(noCode.status()).toBe(400);

    const badState = await page.request.get("/api/auth/instagram/callback?code=x&state=wrong", { maxRedirects: 0 });
    expect(badState.status()).toBe(400);

    // valid state: hit /start first to plant the cookie, extract state, then callback
    const start = await page.request.get("/api/auth/instagram/start", { maxRedirects: 0 });
    const loc = start.headers()["location"] ?? "";
    const state = new URL(loc).searchParams.get("state") ?? "";
    const cb = await page.request.get(`/api/auth/instagram/callback?code=fake&state=${state}`, { maxRedirects: 0 });
    expect(cb.status()).toBe(200); // mock mode: info page, IG_LIVE=false so no network
    expect(await cb.text()).toContain("Mock mode");
  });

  test("settings: Login with Instagram button present in Connections", async ({ page }) => {
    await login(page);
    await page.goto("/settings");
    await page.locator(".si", { hasText: "Connections" }).click();
    await expect(page.getByTestId("ig-oauth")).toBeVisible();
    await expect(page.getByTestId("ig-oauth")).toContainText("Login with Instagram");
  });
});
