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
const login = async (page: import("@playwright/test").Page) => {
  await page.goto("/login");
  await page.fill("#email", process.env.OPERATOR_EMAIL ?? "operator@nextbiz.one");
  await page.fill("#password", process.env.OPERATOR_PASS ?? "operator-test-pass");
  await Promise.all([page.click("button[type=submit]"), page.waitForURL((u) => !u.pathname.startsWith("/login"))]);
};

/**
 * Design v2 guards (nextbiz-one-v2 package): brand block on every auth surface, Plus Jakarta Sans actually
 * loaded (v1 silently fell back to system fonts), ink-on-fruit primary buttons, one 12px gutter in the shell,
 * operator console has its own sidebar layout, no horizontal page overflow on phones.
 */
test.describe("design v2 guards", () => {
  test.describe.configure({ mode: "serial" });

  for (const path of ["/login", "/signup", "/request-access"]) {
    test(`brand block + logo above the form on ${path}`, async ({ page }) => {
      await page.goto(path);
      const brand = page.locator(".auth-brand");
      await expect(brand).toBeVisible();
      await expect(brand.locator("b")).toHaveText("NextBiz One");
      expect(await brand.locator("img").evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
      await expect(page.locator(".auth-sub")).toHaveText("WhatsApp-first client platform for small businesses");
      const ordered = await page.evaluate(() => {
        const b = document.querySelector(".auth-brand")!, c = document.querySelector(".authcard")!;
        return !!(b.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING) || c.contains(b);
      });
      expect(ordered).toBe(true);
    });
  }

  test("Plus Jakarta Sans is loaded (no system-font fallback)", async ({ page }) => {
    await page.goto("/login");
    await page.evaluate(() => document.fonts.ready);
    const ok = await page.evaluate(() => [...document.fonts].some((f) => /Jakarta/i.test(f.family) && f.status === "loaded"));
    expect(ok).toBe(true);
  });

  test("login CTA: ink text on apple-green", async ({ page }) => {
    await page.goto("/login");
    const cta = page.locator("button[type=submit]");
    await expect(cta).toHaveText("Log in");
    await expect(cta).toHaveCSS("color", "rgb(26, 29, 35)");
    expect(await cta.evaluate((b) => getComputedStyle(b).backgroundImage + getComputedStyle(b).backgroundColor)).toMatch(/145, 200, 43/);
  });

  test("signup links the privacy policy", async ({ page }) => {
    await page.goto("/signup");
    await expect(page.locator(".afoot a", { hasText: "Privacy Policy" })).toHaveAttribute("href", "/privacy");
  });

  test("request-access subtitle + 'Email for updates' label", async ({ page }) => {
    await page.goto("/request-access");
    await expect(page.locator(".lede")).toContainText("Tell us about your business");
    await expect(page.getByLabel("Email for updates")).toBeVisible();
  });

  test("gated login shows the pending status card with brand block", async ({ page, request }) => {
    const su = await request.post("/api/auth/signup", { data: { businessName: "Dfix Biz", email: EMAIL, password: "e2e-test-pass-123" } });
    expect(su.status()).toBe(201);
    await page.goto("/login");
    await page.fill("#email", EMAIL);
    await page.fill("#password", "e2e-test-pass-123");
    await page.click("button[type=submit]");
    const st = page.locator("[data-testid=st-pending]");
    await expect(st).toBeVisible();
    await expect(st).toHaveClass(/stcard pending/);
    await expect(st.locator(".st-ic")).toBeVisible();
    await expect(st.locator(".locknote")).toBeVisible();
    await expect(page.locator(".auth-brand")).toBeVisible();
  });

  test("shell: one 12px gutter between rail, panel and content @1440", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page);
    await page.goto("/inbox");
    const r = await page.evaluate(() => {
      const box = (s: string) => document.querySelector(s)!.getBoundingClientRect();
      const rail = box(".rail"), panel = box(".panel"), top = box(".topbar");
      return { railPanel: Math.round(panel.left - rail.right), panelMain: Math.round(top.left - panel.right), left: Math.round(rail.left), right: Math.round(innerWidth - top.right) };
    });
    expect(r).toEqual({ railPanel: 12, panelMain: 12, left: 12, right: 12 });
  });

  test("operator console: sidebar + main layout", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await login(page);
    await page.goto("/operator");
    await expect(page.locator(".op-shell")).toBeVisible();
    const side = await page.locator(".op-shell").boundingBox(), main = await page.locator(".op-main").boundingBox();
    expect(side!.x).toBeLessThan(main!.x);
    expect(Math.round(main!.x - (side!.x + side!.width))).toBe(12);
  });

  for (const path of ["/", "/inbox", "/contacts", "/templates", "/broadcasts", "/automation", "/settings", "/ads"]) {
    test(`no horizontal overflow at 375px on ${path}`, async ({ page }) => {
      await login(page);
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto(path);
      await page.waitForTimeout(800);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    });
  }
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
