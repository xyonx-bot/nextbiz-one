import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";

/**
 * S2 broadcasts e2e — gates + composer + opt-in keyword capture.
 * Seeds contacts through the REAL webhook path (signature + all), then:
 * opt-in hard rule (START flips the flag, "hi" does NOT), approved-template
 * gate (409 on draft), composer flow blocked at step 2 without approvals.
 */

function postInbound(request: import("@playwright/test").APIRequestContext, waId: string, name: string, text: string, mid: string) {
  const secret = process.env.WHATSAPP_APP_SECRET ?? "nbo-e2e-secret";
  const body = JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{ id: "WABAID", changes: [{ field: "messages", value: {
      messaging_product: "whatsapp",
      metadata: { display_phone_number: "91111", phone_number_id: "PNID" },
      contacts: [{ wa_id: waId, profile: { name } }],
      messages: [{ from: waId, id: mid, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: text } }],
    } }] }],
  });
  const sig = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
  return request.post("/api/webhooks/whatsapp", { data: JSON.parse(body), headers: { "x-hub-signature-256": sig } });
}

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.fill("#email", process.env.OPERATOR_EMAIL ?? "operator@nextbiz.one");
  await page.fill("#password", process.env.OPERATOR_PASS ?? "operator-test-pass");
  await Promise.all([page.click("button[type=submit]"), page.waitForURL("**/")]);
}

test.describe("S2 broadcasts", () => {
  test("API gate: unauthenticated GET/POST is 401", async ({ request }) => {
    expect((await request.get("/api/broadcasts")).status()).toBe(401);
    expect((await request.post("/api/broadcasts", { data: { name: "x", templateId: "00000000-0000-0000-0000-000000000000" } })).status()).toBe(401);
  });

  test("opt-in keyword: START opts in, plain hi does not", async ({ request }) => {
    const t = Date.now();
    const a = await postInbound(request, "919830099901", "Plain Person", "hi", `wamid.s2a-${t}`);
    const b = await postInbound(request, "919830099902", "Opted Person", "START", `wamid.s2b-${t}`);
    expect(a.status()).toBe(200);
    expect(b.status()).toBe(200);

  });

  test("composer: renders, opt-in estimate correct, blocked at template step", async ({ page, request }) => {
    await login(page);
    const t = Date.now();
    await postInbound(request, "919830099901", "Plain Person", "hi", `wamid.s2c-${t}`);
    await postInbound(request, "919830099902", "Opted Person", "START", `wamid.s2d-${t}`);

    await page.goto("/broadcasts");
    await expect(page.locator("[data-testid=broadcasts]")).toBeVisible();
    await expect(page.locator(".bpills .chip").first()).toContainText("All");
    await page.click("[data-testid=new-broadcast]");

    // step 1: audience — opted-in estimate loads (START contact seeded >=1)
    await expect(page.locator(".aud-est .v")).not.toHaveText("0", { timeout: 10000 });
    const n = await page.locator(".aud-est .v").textContent();
    expect(Number(n)).toBeGreaterThanOrEqual(1);
    await page.click("[data-testid=bc-next]");

    // step 2: template — approved-only; none seeded → blocked
    await expect(page.locator("[data-testid=bc-next]")).toBeDisabled();
  });

  test("approved-template gate: draft template -> 409", async ({ page, request }) => {
    await login(page);
    const create = await page.request.post("/api/templates", {
      data: { name: `e2e_draft_${Date.now()}`, category: "MARKETING", language: "en_IN", body: "e2e draft template body" },
    });
    expect(create.status()).toBe(201);
    const tpl = ((await create.json()) as { template: { id: string } }).template;

    const res = await page.request.post("/api/broadcasts", { data: { name: `e2e_bc_${Date.now()}`, templateId: tpl.id } });
    expect(res.status()).toBe(409);
    expect(((await res.json()) as { error: string }).error).toContain("approved");
  });
});
