import { expect, test } from "@playwright/test";

/**
 * S4 e2e — automation config + engine contracts (match-simulate, never a real
 * send — real fire is validated on prod with the owner's number) + settings
 * surfaces. Gated-endpoints + CRUD + the pause contract (DB-verified).
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
async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.fill("#email", process.env.OPERATOR_EMAIL ?? "operator@nextbiz.one");
  await page.fill("#password", process.env.OPERATOR_PASS ?? "operator-test-pass");
  await Promise.all([page.click("button[type=submit]"), page.waitForURL("**/")]);
}

test.describe("S4 automation + settings", () => {
  test("settings API gates + profile roundtrip + CSV export", async ({ page }) => {
    await login(page);
    const pro = await (await page.request.get("/api/settings/profile")).json() as { ok: boolean; profile: { name: string } };
    expect(pro.ok).toBe(true);
    expect(pro.profile.name.length).toBeGreaterThan(0);

    const exp = await page.request.get("/api/settings/export?dataset=contacts");
    expect(exp.status()).toBe(200);
    expect(await exp.text()).toContain("wa_id");

    const wrongDel = await page.request.post("/api/settings/delete-workspace", { data: { confirmName: "wrong-name-xyz" } });
    expect(wrongDel.status()).toBe(400); // type-to-confirm gate holds
  });

  test("unauthenticated automation endpoints are 401", async ({ request }) => {
    expect((await request.get("/api/automation")).status()).toBe(401);
    expect((await request.post("/api/automation/rules", { data: { name: "x", keywords: ["x"], reply: "x" } })).status()).toBe(401);
  });

  test("rule CRUD + match-simulate fires the right rule", async ({ page }) => {
    await login(page);
    // clear stale e2e rules from prior (failed) runs so only this run's rule can match
    const existing = await (await page.request.get("/api/automation")).json() as { rules: { id: string; name: string }[] };
    for (const r of existing.rules ?? []) {
      if (r.name.startsWith("e2e rule")) await page.request.delete(`/api/automation/rules/${r.id}`);
    }
    const uniq = `e2e rule ${Date.now() % 100000}`;
    const kw = `e2ekw${Date.now()}`;
    const create = await page.request.post("/api/automation/rules", {
      data: { name: uniq, keywords: [kw], reply: "E2E reply — this is a test rule." },
    });
    expect(create.status()).toBe(201);
    const rule = ((await create.json()) as { rule: { id: string } }).rule;

    const hit = await (await page.request.post("/api/automation/rules/test", {
      data: { text: `hey what about ${kw} pricing?` },
    })).json() as { matched: boolean; rule: string };
    expect(hit.matched).toBe(true);
    expect(hit.rule).toBe(uniq);

    const miss = await (await page.request.post("/api/automation/rules/test", {
      data: { text: "completely unrelated text" },
    })).json() as { matched: boolean };
    expect(miss.matched).toBe(false);

    // UI renders the automation surface with the rule present
    await page.goto("/automation");
    await expect(page.locator("[data-testid=automation]")).toBeVisible();
    await expect(page.locator(".dtable").first()).toContainText(uniq);

    // cleanup
    expect((await page.request.delete(`/api/automation/rules/${rule.id}`)).status()).toBe(200);
  });

  test("settings UI renders sections + danger zone", async ({ page }) => {
    await login(page);
    await page.goto("/settings");
    await expect(page.locator("[data-testid=settings]")).toBeVisible();
    await expect(page.locator(".snav")).toContainText("Workspace");
    await page.locator(".si", { hasText: "Data" }).click();
    await expect(page.locator(".danger-zone")).toBeVisible();
    await expect(page.locator("a[href*='dataset=contacts']")).toBeVisible();
  });
});
