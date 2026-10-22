import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";

/**
 * S0 smoke — the acceptance spine: gate, login, shell, webhook.
 * Webhook e2e runs against the local DB (seeded fresh), proving the
 * full inbound path: signature -> raw store -> contact -> conversation
 * -> message row.
 */
test.describe("NBO S0", () => {
  test("health endpoint is public", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });

  test("hard gate: unauthenticated / bounces to /login", async ({ page }) => {
    await page.goto("/");
    await page.waitForURL("**/login**");
    expect(page.url()).toContain("/login");
  });

  test("login: wrong creds rejected, operator env creds pass, shell renders", async ({ page }) => {
    await page.goto("/login");
    await page.fill("#email", "nobody@example.com");
    await page.fill("#password", "wrong-password");
    await page.click("button[type=submit]");
    await expect(page.locator(".aerr")).toBeVisible();

    await page.fill("#email", process.env.OPERATOR_EMAIL ?? "operator@nextbiz.one");
    await page.fill("#password", process.env.OPERATOR_PASS ?? "operator-test-pass");
    await Promise.all([page.click("button[type=submit]"), page.waitForURL("**/")]);
    // shell v4.3 frame: rail + header card; leaf page hides the panel
    await expect(page.locator(".rail")).toBeVisible();
    await expect(page.locator(".header-card")).toBeVisible();
    await expect(page.locator("[data-testid=nav-panel]")).toHaveCount(0);
    await expect(page.locator(".usr b")).toContainText(/.+/);
  });

  test("webhook GET: echoes hub.challenge on valid verify token", async ({ request }) => {
    const res = await request.get("/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=nbo-e2e-verify&hub.challenge=CHALLENGE-42");
    expect(res.status()).toBe(200);
    expect(await res.text()).toBe("CHALLENGE-42");
    const bad = await request.get("/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=X");
    expect(bad.status()).toBe(403);
  });

  test("webhook POST: valid signature stores the inbound message; invalid is rejected", async ({ request }) => {
    const secret = process.env.WHATSAPP_APP_SECRET ?? "nbo-e2e-secret";
    const body = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{
        id: "WABAID",
        changes: [{
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: { display_phone_number: "91111", phone_number_id: "PNID" },
            contacts: [{ wa_id: "919830012345", profile: { name: "Joydip" } }],
            messages: [{ from: "919830012345", id: `wamid.e2e-${Date.now()}`, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: "hi" } }],
          },
        }],
      }],
    });
    const sig = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");

    const bad = await request.post("/api/webhooks/whatsapp", { data: JSON.parse(body), headers: { "x-hub-signature-256": "sha256=" + "0".repeat(64) } });
    expect(bad.status()).toBe(401);

    const ok = await request.post("/api/webhooks/whatsapp", { data: JSON.parse(body), headers: { "x-hub-signature-256": sig } });
    expect(ok.status()).toBe(200);
    expect(((await ok.json()) as { stored: number }).stored).toBe(1);
  });
});
