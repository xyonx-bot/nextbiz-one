import { expect, test } from "@playwright/test";

/**
 * r-nbo-s3-design-fix — Mira's fix list A-E as measurable live tokens:
 *  A: brand block (logo + wordmark + tagline) renders ABOVE the card on every
 *     auth page (login/signup/request-access) and on the gated status state
 *  B: /operator spacing — op-main gap 14px; op-shell padding 12px; op-card
 *     radius 18px; right canvas margin 12+12 = 24px at 1280 viewport
 *  C: login CTA — DARK (ink) text on lime; button copy "Log In"
 *  D: signup legal microcopy (Terms + Privacy Policy) below the CTA
 *  E: request-access full subtitle + "Email for updates" label
 *
 * PROD GUARD: this spec MUST NOT run against production. If DATABASE_URL
 * contains the prod host (one-db:5432 / one.nextbizstudio.com), the spec
 * exits immediately — no DB mutations. CI uses a side-DB.
 */
const PROD_DB_URL = process.env.DATABASE_URL ?? "";
if (PROD_DB_URL.includes("one-db:5432") || PROD_DB_URL.includes("one.nextbizstudio.com")) {
  console.error("[PROD GUARD] DATABASE_URL points to production. E2E suite aborted.");
  process.exit(0);
}
const EMAIL = `e2e_dfix_${Date.now()}@nbo.test`;

test.describe("S3 design-fix (r-nbo-s3-design-fix)", () => {
  test.describe.configure({ mode: "serial" });

  for (const path of ["/login", "/signup", "/request-access"]) {
    test(`A: brand block above card on ${path}`, async ({ page }) => {
      await page.goto(path);
      const brand = page.locator(".auth-brand");
      await expect(brand).toBeVisible();
      await expect(brand.locator("b")).toHaveText("NextBiz One");
      await expect(brand.locator("img")).toHaveCSS("width", "30px");
      await expect(page.locator(".auth-sub")).toHaveText(
        "WhatsApp-first client platform for small businesses",
      );
      // brand strictly precedes the card in DOM order (above it visually)
      const ordered = await page.evaluate(() => {
        const b = document.querySelector(".auth-brand")!;
        const c = document.querySelector(".authcard")!;
        return !!(b.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING);
      });
      expect(ordered).toBe(true);
    });
  }

  test("C: login CTA dark text on lime + copy 'Log In'", async ({ page }) => {
    await page.goto("/login");
    const cta = page.locator(".authwrap .btn-chat");
    await expect(cta).toHaveText("Log In");
    await expect(cta).toHaveCSS("color", "rgb(26, 29, 35)"); // --ink dark text
    await expect(cta).toHaveCSS("background-color", "rgb(145, 200, 43)"); // lime fill
  });

  test("D: signup legal microcopy below CTA", async ({ page }) => {
    await page.goto("/signup");
    const foot = page.locator(".afoot", { hasText: "By continuing you agree to the" });
    await expect(foot).toBeVisible();
    await expect(foot.locator("a", { hasText: "Terms" })).toBeVisible();
    await expect(foot.locator("a", { hasText: "Privacy Policy" })).toBeVisible();
  });

  test("E: request-access full subtitle + 'Email for updates' label", async ({ page }) => {
    await page.goto("/request-access");
    await expect(page.locator(".lede")).toHaveText(
      "Tell us about your business — we review in ~1 day",
    );
    await expect(page.getByLabel("Email for updates")).toBeVisible();
  });

  test("A: gated pending state keeps brand block + wireframe card classes", async ({ page, request }) => {
    const su = await request.post("/api/auth/signup", {
      data: { businessName: "Dfix Biz", email: EMAIL, password: "e2e-test-pass-123" },
    });
    expect(su.status()).toBe(201);
    await page.goto("/login");
    await page.fill("#email", EMAIL);
    await page.fill("#password", "e2e-test-pass-123");
    await page.click("button[type=submit]");
    const st = page.locator("[data-testid=st-pending]");
    await expect(st).toBeVisible();
    // wireframe classes (was unstyled warn-card before the fix)
    await expect(st).toHaveClass(/stcard pending/);
    await expect(st.locator(".st-ic")).toBeVisible();
    await expect(st.locator(".locknote img")).toBeVisible();
    // brand block still above the status card
    const ordered = await page.evaluate(() => {
      const b = document.querySelector(".auth-brand")!;
      const c = document.querySelector(".stcard")!;
      return !!(b.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(ordered).toBe(true);
  });

  test("B: operator spacing tokens (gap 14 / radius 18 / canvas margin 24 @1280)", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/login");
    await page.fill("#email", process.env.OPERATOR_EMAIL ?? "operator@nextbiz.one");
    await page.fill("#password", process.env.OPERATOR_PASS ?? "operator-test-pass");
    await Promise.all([page.click("button[type=submit]"), page.waitForURL("**/")]);
    await page.goto("/operator");
    await expect(page.locator(".op-shell")).toBeVisible();
    // wireframe spacing: op-main flex column gap 14px + 12/12/26 padding
    await expect(page.locator(".op-main")).toHaveCSS("gap", "14px");
    await expect(page.locator(".op-main")).toHaveCSS("padding", "12px 12px 26px");
    await expect(page.locator(".op-shell")).toHaveCSS("padding", "12px");
    // op-card radius = v1.2 --r-lg 18px (mira measured 12-14 live before)
    await expect(page.locator(".op-card").first()).toHaveCSS("border-radius", "18px");
    // right canvas margin at 1280 = shell 12 + main 12 = 24px (mira's ~22px spec)
    const margin = await page.evaluate(() => {
      const card = document.querySelector(".op-card")!;
      return window.innerWidth - card.getBoundingClientRect().right;
    });
    expect(margin).toBe(24);
  });
});

test.afterAll(async () => {
  // Safe cleanup using pg Pool (prod guard above exits early if prod)
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query(`
      DELETE FROM access_requests WHERE email LIKE 'e2e_dfix_%@nbo.test';
      DELETE FROM users WHERE email LIKE 'e2e_dfix_%@nbo.test';
    `);
  } catch {
    // best-effort cleanup; side-DB is throwaway
  } finally {
    await pool.end();
  }
});
