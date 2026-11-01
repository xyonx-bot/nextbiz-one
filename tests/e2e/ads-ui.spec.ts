import { expect, test } from "@playwright/test";

/**
 * Ads UI e2e (P2.1–P2.3 + dashboard mount) — ported surfaces:
 * /ads master-detail, /ads/new 7-step wizard, /ads/performance, dashboard mount.
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

test.describe("Ads UI (P2 mock port)", () => {
  test("P2.1 /ads — pills w/ counts, search, select, mock badge, QA menu", async ({ page }) => {
    await login(page);
    await page.goto("/ads");
    await expect(page.getByTestId("ads-campaigns")).toBeVisible();
    // status pills with counts
    for (const p of ["all", "ACTIVE", "PAUSED", "IN_REVIEW", "DRAFT"]) {
      await expect(page.getByTestId(`pill-${p}`)).toBeVisible();
    }
    // mock badge contract on the surface
    await expect(page.locator(".badge-mock").first()).toBeVisible();
    // search filters rows
    await expect(page.locator(".crow").first()).toBeVisible();
    const before = await page.locator(".crow").count();
    await page.getByTestId("ads-search").fill("festive");
    await expect(page.locator(".crow")).toHaveCount(1);
    await page.getByTestId("ads-search").fill("");
    expect(await page.locator(".crow").count()).toBe(before);
    // empty filter result state
    await page.getByTestId("ads-search").fill("zzz-no-match");
    await expect(page.locator(".clist .cempty")).toBeVisible();
    await page.getByTestId("ads-search").fill("");
    // select a demo row → detail with populated insights wells; toggle disabled (demo read-only)
    await page.locator('.crow[data-testid^="crow-demo-"]').first().click();
    await expect(page.getByTestId("insights-wells")).toBeVisible();
    await expect(page.getByTestId("toggle-status")).toBeDisabled();
    // IN_REVIEW pill → review banner on the in-review row
    await page.getByTestId("pill-IN_REVIEW").click();
    await page.locator(".crow").first().click();
    await expect(page.getByTestId("review-banner")).toBeVisible();
    await expect(page.getByTestId("zerores")).toBeVisible();
    // header quick-action: New Campaign split button opens menu AND tiles navigate
    await page.getByTestId("qa-btn").click();
    await expect(page.getByTestId("qa-menu")).toBeVisible();
    // menu must escape the header-card clip (overflow) — click must land on the tile's anchor
    await page.locator(".qa-menu a[href='/ads/new'] .qa-tile").click();
    await page.waitForURL("**/ads/new");
    await expect(page.getByTestId("ads-wizard")).toBeVisible();
  });

  test("P2.1 kebab menu — cancel an in-review campaign → Cancelled pill + state", async ({ page }) => {
    await login(page);
    // create an in-review campaign via API
    const t = Date.now();
    const created = await page.request.post("/api/ads/campaigns", {
      data: { name: `E2E Cancel ${t}`, objective: "OUTCOME_LEADS", daily_budget: 300, destination: "whatsapp", submit: true },
    });
    expect(created.status()).toBe(201);
    const cid = ((await created.json()) as { campaign: { id: string } }).campaign.id;
    await page.goto("/ads?status=IN_REVIEW");
    await page.locator(`.crow[data-testid="crow-${cid}"]`).click();
    await expect(page.getByTestId("review-banner")).toBeVisible();
    // kebab → Cancel review → two-tap confirm
    await page.getByTestId("kebab").click();
    await expect(page.getByTestId("cd-menu")).toBeVisible();
    await page.getByTestId("cancel-campaign").click(); // arm
    await page.getByTestId("cancel-campaign").click(); // confirm
    await expect(page.locator(".cd-head .st.cancelled")).toBeVisible();
    // API truth
    const one = await page.request.get(`/api/ads/campaigns/${cid}`);
    expect(((await one.json()) as { campaign: { status: string } }).campaign.status).toBe("CANCELLED");
    // cancelled pill exists with count
    await page.getByTestId("pill-CANCELLED").click();
    await expect(page.locator(`.crow[data-testid="crow-${cid}"]`)).toBeVisible();
  });

  test("P2.1 v2 — row kebab per row (no row-select on trigger, one-open, Esc close, copy hint), grid rows, tint wells, slist settings", async ({ page }) => {
    await login(page);
    await page.goto("/ads");
    await expect(page.getByTestId("ads-campaigns")).toBeVisible();
    // v2: rows are compact left-aligned 4-col grids, not tall centered boxes
    const demoRow = page.locator('.crow[data-testid^="crow-demo-"]').first();
    await expect(demoRow).toBeVisible();
    const rowId = (await demoRow.getAttribute("data-testid"))!.slice("crow-".length);
    expect(await demoRow.evaluate((el) => getComputedStyle(el).display)).toBe("grid");
    // kebab on the row; trigger click must NOT fire row select
    const headTitleBefore = await page.locator(".cd-head .tt b").textContent();
    await page.getByTestId(`kebab-${rowId}`).click();
    await expect(page.getByTestId(`kebab-menu-${rowId}`)).toBeVisible();
    expect(await page.locator(".cd-head .tt b").textContent()).toBe(headTitleBefore);
    // menu contents: pause/resume disabled on demo rows; copy item carries the mono id hint
    await expect(page.getByTestId(`menu-toggle-row-${rowId}`)).toBeDisabled();
    await expect(page.getByTestId(`menu-copy-row-${rowId}`)).toContainText(rowId);
    // one open at a time: opening another row's kebab leaves exactly one .kebab.open
    // (dispatchEvent: the first menu overlaps row 2's trigger geometrically — real
    // pointer would land on the open menu item, which also closes it)
    const otherRow = page.locator('.crow[data-testid^="crow-demo-"]').nth(1);
    const otherId = (await otherRow.getAttribute("data-testid"))!.slice("crow-".length);
    await page.getByTestId(`kebab-${otherId}`).dispatchEvent("click");
    await expect(page.locator(".azone .kebab.open")).toHaveCount(1);
    await expect(page.getByTestId(`kebab-menu-${otherId}`)).toBeVisible();
    await expect(page.getByTestId(`kebab-menu-${rowId}`)).toHaveCount(0);
    // Esc closes
    await page.keyboard.press("Escape");
    await expect(page.locator(".azone .kebab.open")).toHaveCount(0);
    // View performance navigates from the row menu
    await page.getByTestId(`kebab-${rowId}`).click();
    await Promise.all([
      page.getByTestId(`menu-perf-row-${rowId}`).click(),
      page.waitForURL("**/ads/performance"),
    ]);
    // back on /ads: v2 detail — ads-tint wells with NO delta arrows, slist def-list, two sunken .cdc panels, no fixture/API-409 body text
    await page.goto("/ads");
    await page.locator('.crow[data-testid^="crow-demo-"]').first().click();
    await expect(page.getByTestId("insights-wells")).toBeVisible();
    expect(await page.locator(".azone .well .d").count()).toBe(0);
    expect(await page.locator(".azone .well").first().evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(255, 240, 227)");
    await expect(page.locator(".azone .cdc")).toHaveCount(2);
    await expect(page.locator(".azone .slist .srow").first()).toBeVisible();
    await expect(page.locator(".azone .cd-body")).not.toContainText("fixture");
    await expect(page.locator(".azone .cd-body")).not.toContainText("API 409");
  });

  test("P2.2 /ads/new — 7-step wizard, validation, live preview, submit → IN_REVIEW", async ({ page }) => {
    await login(page);
    await page.goto("/ads/new");
    await expect(page.getByTestId("ads-wizard")).toBeVisible();
    // step 1 validation: continue without name/objective → error, stays on step 1
    await page.getByTestId("wiz-next").click();
    await expect(page.getByTestId("wizard-error")).toBeVisible();
    await page.getByTestId("f-name").fill(`E2E UI Campaign ${Date.now()}`);
    await page.getByTestId("obj-OUTCOME_ENGAGEMENT").click();
    await page.getByTestId("wiz-next").click();
    // step 2 audience
    await page.getByTestId("f-audience").fill("18-45 Kolkata");
    await expect(page.getByTestId("cnt-audience")).toContainText("13/200");
    await page.getByTestId("wiz-next").click();
    // step 3 budget: 0 → error; then valid
    await page.getByTestId("f-budget").fill("0");
    await page.getByTestId("wiz-next").click();
    await expect(page.getByTestId("wizard-error")).toContainText("budget above");
    await page.getByTestId("f-budget").fill("750");
    await page.getByTestId("wiz-next").click();
    // step 4 creative → preview updates live
    await page.getByTestId("f-headline").fill("E2E headline");
    await page.getByTestId("f-body").fill("E2E body copy");
    await expect(page.getByTestId("pv-headline")).toContainText("E2E headline");
    await expect(page.getByTestId("cnt-headline")).toContainText("12/120");
    await page.getByTestId("wiz-next").click();
    // step 5 destination required
    await page.getByTestId("wiz-next").click();
    await expect(page.getByTestId("wizard-error")).toBeVisible();
    await page.getByTestId("dest-whatsapp").click();
    await page.getByTestId("wiz-next").click();
    // step 6 review, step 7 submit for review → redirect to /ads?status=IN_REVIEW
    await page.getByTestId("wiz-next").click();
    await Promise.all([
      page.getByTestId("wiz-submit").click(),
      page.waitForURL("**/ads?status=IN_REVIEW"),
    ]);
    await expect(page.getByTestId("pill-IN_REVIEW")).toBeVisible();
  });

  test("P2.2 draft path — save as draft lands in Drafts pill", async ({ page }) => {
    await login(page);
    await page.goto("/ads/new");
    await page.getByTestId("f-name").fill(`E2E Draft ${Date.now()}`);
    await page.getByTestId("obj-OUTCOME_TRAFFIC").click();
    await page.getByTestId("wiz-next").click();
    await page.getByTestId("wiz-next").click(); // audience (optional)
    await page.getByTestId("f-budget").fill("500");
    await page.getByTestId("wiz-next").click();
    await page.getByTestId("wiz-next").click(); // creative (optional)
    await page.getByTestId("dest-website").click();
    await Promise.all([
      page.getByTestId("wiz-draft").click(),
      page.waitForURL("**/ads?status=DRAFT"),
    ]);
    await expect(page.getByTestId("pill-DRAFT")).toBeVisible();
  });

  test("P2.3 /ads/performance — stats, range switch, chart tooltip, breakdown table", async ({ page }) => {
    await login(page);
    await page.goto("/ads/performance");
    await expect(page.getByTestId("ads-performance")).toBeVisible();
    await expect(page.locator(".badge-mock").first()).toBeVisible();
    // 6 stat cards
    await expect(page.locator(".stat")).toHaveCount(6);
    // 7d default: 7 bars
    await expect(page.locator(".cbar")).toHaveCount(7);
    // hover tooltip
    await page.locator(".cbar").first().hover();
    await expect(page.getByTestId("ctip")).toBeVisible();
    // switch to 30d
    await page.getByTestId("range-30d").click();
    await expect(page.locator(".cbar")).toHaveCount(30);
    // per-campaign breakdown rows exist
    expect(await page.locator(".brow:not(.bth)").count()).toBeGreaterThanOrEqual(7);
  });

  test("dashboard mount — ads dashcard with demo badge on /", async ({ page }) => {
    await login(page);
    await page.goto("/");
    const mount = page.getByTestId("ads-mount");
    await expect(mount).toBeVisible();
    await expect(mount.locator(".badge-mock")).toBeVisible();
    await expect(mount.locator(".ministats .ms")).toHaveCount(4);
    await expect(mount.locator(".dashlink")).toContainText("View performance");
  });
});
