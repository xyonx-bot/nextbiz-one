import { test, expect } from "@playwright/test";

const DB = process.env.DATABASE_URL ?? "";
if (DB.includes("one-db:5432") || DB.includes("one.nextbizstudio.com")) { console.error("[PROD GUARD] E2E suite aborted."); process.exit(0); }
async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.fill("#email", process.env.OPERATOR_EMAIL ?? "operator@nextbiz.one");
  await page.fill("#password", process.env.OPERATOR_PASS ?? "operator-test-pass");
  await Promise.all([page.click("button[type=submit]"), page.waitForURL((u) => !u.pathname.startsWith("/login"))]);
}

/** v1.8: template header/buttons + ⋮ menu, single-contact template send, add/import contacts, compact sessions. */
test.describe("templates & contacts v1.8", () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test("template editor: image header, footer, buttons; ⋮ menu deletes a draft", async ({ page }) => {
    const name = `e2e_hdr_${Date.now()}`;
    await page.goto("/templates?new=1");
    await page.fill("#tpl-name", name);
    await page.fill("[data-testid=tpl-body-input]", "Hi {{1}}! Your order is ready — see you soon.");
    await page.click("[data-testid=hdr-IMAGE]");
    await page.setInputFiles("[data-testid=hdr-file]", "public/logo.png");
    await expect(page.locator(".drop.has img")).toBeVisible();
    await page.fill("[data-testid=tpl-footer]", "Reply STOP to unsubscribe");
    await page.click("[data-testid=add-qr]");
    await page.locator("[data-testid=tpl-btn] input").first().fill("Yes please");
    await page.getByTestId("tpl-preview-toggle").click();
    await expect(page.locator(".pv-inline .wbub .hm")).toBeVisible();
    await expect(page.locator(".pv-inline .wbub .bt", { hasText: "Yes please" })).toBeVisible();
    await page.getByTestId("tpl-preview-toggle").click();
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByTestId("tpl-note")).toContainText("Draft saved");
    const row = page.getByTestId("trow").filter({ hasText: name });
    await row.hover(); await row.getByTestId("tpl-kebab").click();
    await expect(page.getByTestId("tpl-menu")).toContainText("Submit to Meta");
    await page.getByTestId("tpl-delete").click(); await page.getByTestId("tpl-del-yes").click();
    await expect(page.getByTestId("trow").filter({ hasText: name })).toHaveCount(0);
  });

  test("contacts: add one, import a CSV, open send-template", async ({ page }) => {
    const n = String(Date.now()).slice(-8);
    await page.goto("/contacts");
    await page.getByTestId("add-open").click();
    await page.fill("[data-testid=ac-phone]", `90${n}`);
    await page.fill("[data-testid=ac-name]", `E2E Added ${n}`);
    await page.getByTestId("ac-save").click();
    await expect(page.getByTestId("contacts-toast")).toContainText(/added|updated/);
    await page.getByTestId("import-open").click();
    await page.setInputFiles("[data-testid=import-file]", { name: "c.csv", mimeType: "text/csv", buffer: Buffer.from(`name,phone\nE2E Imp ${n},+91 81${n}\nBad,12\n`) });
    await expect(page.getByTestId("import-run")).toContainText("Import 1 contact");
    await page.getByTestId("import-run").click();
    await expect(page.getByTestId("import-result")).toContainText("1 new contact");
    await page.goto("/contacts");
    await page.getByTestId("krow").filter({ hasText: `E2E Added ${n}` }).click();
    await page.getByTestId("pf-send-tpl").click();
    await expect(page.getByTestId("tsend-modal")).toBeVisible();
  });

  test("API: import never opts people in without consent; bad numbers are reported", async ({ page }) => {
    const n = String(Date.now()).slice(-8);
    const r = await page.request.post("/api/contacts/import", { data: { rows: [{ phone: `70${n}`, optIn: true }, { phone: "abc" }], consent: false } });
    const d = await r.json();
    expect(d.added + d.updated).toBe(1); expect(d.skipped).toBe(1);
    const list = await (await page.request.get("/api/contacts")).json();
    expect(list.contacts.find((c: { wa_id: string }) => c.wa_id === `9170${n}`)?.opt_in).toBe(false);
  });
});
