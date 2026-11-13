import { expect, test } from "@playwright/test";
import { createHmac } from "node:crypto";

/**
 * Regression (v1.1.0): on desktop the inbox auto-opens the newest chat as a preview. That preview must NOT
 * mark the chat read — only an explicit click (or replying) does. PROD GUARD like the other specs.
 */
const PROD_DB_URL = process.env.DATABASE_URL ?? "";
if (PROD_DB_URL.includes("one-db:5432") || PROD_DB_URL.includes("one.nextbizstudio.com")) {
  console.error("[PROD GUARD] DATABASE_URL points to production. E2E suite aborted.");
  process.exit(0);
}

const WA = `91977${String(Date.now()).slice(-7)}`;
const NAME = `Autoread ${WA.slice(-4)}`;

function postInbound(request: import("@playwright/test").APIRequestContext, text: string, mid: string) {
  const secret = process.env.WHATSAPP_APP_SECRET ?? "nbo-e2e-secret";
  const body = JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{ id: "WABAID", changes: [{ field: "messages", value: {
      messaging_product: "whatsapp",
      metadata: { display_phone_number: "91111", phone_number_id: "PNID" },
      contacts: [{ wa_id: WA, profile: { name: NAME } }],
      messages: [{ from: WA, id: mid, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: text } }],
    } }] }],
  });
  const sig = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
  return request.post("/api/webhooks/whatsapp", { data: body, headers: { "Content-Type": "application/json", "X-Hub-Signature-256": sig } });
}

async function unreadFor(page: import("@playwright/test").Page) {
  const d = (await (await page.request.get("/api/conversations")).json()) as { conversations: { wa_id: string; unread: number }[] };
  return d.conversations.find((c) => c.wa_id === WA)?.unread ?? -1;
}

test("inbox auto-open previews the newest chat without marking it read; a click does", async ({ page, request }) => {
  expect((await postInbound(request, "autoread check", `wamid.autoread-${Date.now()}`)).status()).toBe(200);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/login");
  await page.fill("#email", process.env.OPERATOR_EMAIL ?? "operator@nextbiz.one");
  await page.fill("#password", process.env.OPERATOR_PASS ?? "operator-test-pass");
  await Promise.all([page.click("button[type=submit]"), page.waitForURL((u) => !u.pathname.startsWith("/login"))]);

  await page.goto("/inbox");
  // newest chat is auto-opened as a preview
  await expect(page.locator(".thead .who")).toContainText(NAME);
  await page.waitForTimeout(1500);
  expect(await unreadFor(page)).toBeGreaterThan(0);
  await expect(page.locator("[data-testid=crow]", { hasText: NAME }).locator(".badge")).toBeVisible();

  // explicit click marks it read
  await page.locator("[data-testid=crow]", { hasText: NAME }).click();
  await expect.poll(() => unreadFor(page), { timeout: 10000 }).toBe(0);
});

test.afterAll(async () => {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query(`DELETE FROM messages WHERE conversation_id IN (SELECT c.id FROM conversations c JOIN contacts ct ON ct.id = c.contact_id WHERE ct.wa_id = $1)`, [WA]);
    await pool.query(`DELETE FROM conversations WHERE contact_id IN (SELECT id FROM contacts WHERE wa_id = $1)`, [WA]);
    await pool.query(`DELETE FROM contacts WHERE wa_id = $1`, [WA]);
  } finally { await pool.end(); }
});
