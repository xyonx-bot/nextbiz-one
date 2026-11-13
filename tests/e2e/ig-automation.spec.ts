import { expect, test } from "@playwright/test";
import { createHmac } from "node:crypto";

/**
 * Instagram automation (mock mode: IG_LIVE=false — sends are simulated, nothing reaches Meta).
 * DM keyword reply · human reply pauses automation · Instagram-app echo pauses automation ·
 * comment → private DM + public reply · Instagram threads in the inbox. PROD GUARD like the other specs.
 */
const PROD_DB_URL = process.env.DATABASE_URL ?? "";
if (PROD_DB_URL.includes("one-db:5432") || PROD_DB_URL.includes("one.nextbizstudio.com")) {
  console.error("[PROD GUARD] DATABASE_URL points to production. E2E suite aborted.");
  process.exit(0);
}

const T = Date.now();
const ACCT = `ig-e2e-acct-${T}`;
const FAN = `ig-e2e-fan-${T}`;
const FAN2 = `ig-e2e-fan2-${T}`;
const KW = `pricing${T % 100000}`;
const REPLY = `Our packages start at 9999 (${T})`;
const PUBLIC = `Sent you a DM (${T})`;

function post(request: import("@playwright/test").APIRequestContext, payload: unknown) {
  const body = JSON.stringify(payload);
  const secret = process.env.IG_APP_SECRET ?? "nbo-e2e-ig-secret";
  const sig = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
  return request.post("/api/webhooks/instagram", { data: body, headers: { "Content-Type": "application/json", "x-hub-signature-256": sig } });
}
const dm = (from: string, mid: string, text: string, echo = false) => ({
  object: "instagram",
  entry: [{ id: ACCT, time: Date.now(), messaging: [{ sender: { id: echo ? ACCT : from }, recipient: { id: echo ? from : ACCT }, timestamp: Date.now(), message: { mid, text, ...(echo ? { is_echo: true } : {}) } }] }],
});
const comment = (from: string, id: string, text: string) => ({
  object: "instagram",
  entry: [{ id: ACCT, time: Date.now(), changes: [{ field: "comments", value: { id, text, from: { id: from, username: "e2e_commenter" }, media: { id: `media-${T}` } } }] }],
});

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.fill("#email", process.env.OPERATOR_EMAIL ?? "operator@nextbiz.one");
  await page.fill("#password", process.env.OPERATOR_PASS ?? "operator-test-pass");
  await Promise.all([page.click("button[type=submit]"), page.waitForURL((u) => !u.pathname.startsWith("/login"))]);
}
type ThreadRow = { id: string; igsid: string; last_direction: string | null; preview: string | null };
async function threadOf(page: import("@playwright/test").Page, igsid: string) {
  const d = (await (await page.request.get("/api/instagram/threads")).json()) as { threads: ThreadRow[] };
  return d.threads.find((t) => t.igsid === igsid) ?? null;
}
async function messagesOf(page: import("@playwright/test").Page, id: string) {
  const d = (await (await page.request.get(`/api/instagram/threads/${id}`)).json()) as { thread: { automationPaused: boolean }; messages: { direction: string; body: string; origin: string; status: string }[] };
  return d;
}

test.describe.serial("Instagram automation (mock mode)", () => {
  let ruleId = "";

  test("rule for Instagram DMs + comments can be created", async ({ page }) => {
    await login(page);
    const r = await page.request.post("/api/automation/rules", {
      data: { name: `e2e IG ${T}`, keywords: [KW], reply: REPLY, onWhatsapp: false, onInstagramDm: true, onInstagramComment: true, commentPublicReply: PUBLIC },
    });
    expect(r.status()).toBe(201);
    const rule = ((await r.json()) as { rule: { id: string; on_instagram_dm: boolean; on_instagram_comment: boolean; comment_public_reply: string } }).rule;
    expect(rule.on_instagram_dm).toBe(true);
    expect(rule.comment_public_reply).toBe(PUBLIC);
    ruleId = rule.id;
  });

  test("DM with the keyword → automatic reply in the thread", async ({ page, request }) => {
    expect((await post(request, dm(FAN, `mid-a-${T}`, `hi, what's your ${KW}?`))).status()).toBe(200);
    await login(page);
    const th = await threadOf(page, FAN);
    expect(th).not.toBeNull();
    const m = await messagesOf(page, th!.id);
    expect(m.messages.some((x) => x.direction === "in" && x.body.includes(KW))).toBe(true);
    expect(m.messages.some((x) => x.direction === "out" && x.origin === "automation" && x.body === REPLY && x.status === "sent")).toBe(true);
    expect(m.thread.automationPaused).toBe(false);
  });

  test("a person replying pauses automation for that thread", async ({ page, request }) => {
    await login(page);
    const th = (await threadOf(page, FAN))!;
    const send = await page.request.post(`/api/instagram/threads/${th.id}/messages`, { data: { body: "Hi! I'm here — let me help." } });
    expect(send.status()).toBe(200);
    const before = await messagesOf(page, th.id);
    expect(before.thread.automationPaused).toBe(true);
    // keyword again → no new automation reply
    await post(request, dm(FAN, `mid-b-${T}`, `${KW} again please`));
    const after = await messagesOf(page, th.id);
    expect(after.messages.filter((x) => x.origin === "automation").length).toBe(before.messages.filter((x) => x.origin === "automation").length);
    expect(after.messages.some((x) => x.body.includes(`${KW} again`))).toBe(true);
  });

  test("reply sent from the Instagram app (echo) also pauses automation", async ({ page, request }) => {
    await post(request, dm(FAN2, `mid-c-${T}`, "hello there"));
    await post(request, dm(FAN2, `mid-d-${T}`, "Replying from my phone", true));
    await login(page);
    const th = (await threadOf(page, FAN2))!;
    const m = await messagesOf(page, th.id);
    expect(m.messages.some((x) => x.direction === "out" && x.origin === "ig_app")).toBe(true);
    expect(m.thread.automationPaused).toBe(true);
  });

  test("comment with the keyword → private DM + public reply", async ({ page, request }) => {
    const commenter = `ig-e2e-commenter-${T}`;
    expect((await post(request, comment(commenter, `cmt-${T}`, `love this! ${KW}?`))).status()).toBe(200);
    await login(page);
    const th = await threadOf(page, commenter);
    expect(th).not.toBeNull();
    expect((await messagesOf(page, th!.id)).messages.some((x) => x.body === REPLY && x.origin === "automation")).toBe(true);
    const log = (await (await page.request.get("/api/automation")).json()) as { log: { type: string; status: string; detail: string | null }[] };
    expect(log.log.some((l) => l.type === "comment" && l.status === "sent")).toBe(true);
  });

  test("Instagram threads show in the inbox with their own filter", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page);
    await page.goto("/inbox");
    await page.getByTestId("filter-ig").click();
    const row = page.locator("[data-testid=crow]").first();
    await expect(row.locator(".src.ig")).toBeVisible();
    await row.click();
    await expect(page.locator(".thead .who small")).toContainText(/Instagram/);
  });

  test.afterAll(async () => {
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      await pool.query(`DELETE FROM ig_accounts WHERE ig_user_id = $1`, [ACCT]); // cascades threads/messages/comments
      await pool.query(`DELETE FROM ig_webhook_events WHERE ig_event_id LIKE $1`, [`${ACCT}:%`]);
      if (ruleId) await pool.query(`DELETE FROM keyword_rules WHERE id = $1`, [ruleId]);
      await pool.query(`DELETE FROM automation_log WHERE detail LIKE $1`, [`%e2e IG ${T}%`]);
    } finally { await pool.end(); }
  });
});
