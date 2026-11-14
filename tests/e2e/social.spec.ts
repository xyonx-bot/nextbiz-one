import { expect, test } from "@playwright/test";
import { createHmac } from "node:crypto";
import { Pool } from "pg";
import { hash } from "bcryptjs";

/**
 * NextBiz Social (mock mode: IG_LIVE=false — replies are simulated, nothing reaches Meta).
 * A fresh workspace with a connected Instagram account receives comments through the real webhook:
 * a rule answers one automatically, the other waits in "Needs reply"; we reply publicly, send the one
 * allowed private DM, dismiss/undo, and check another workspace can't see any of it. PROD GUARD.
 */
const PROD_DB_URL = process.env.DATABASE_URL ?? "";
if (PROD_DB_URL.includes("one-db:5432") || PROD_DB_URL.includes("one.nextbizstudio.com")) {
  console.error("[PROD GUARD] DATABASE_URL points to production. E2E suite aborted.");
  process.exit(0);
}

const T = Date.now();
const EMAIL = `social-${T}@e2e.test`, PASS = `social-pass-${T}`;
const ACCT = `ig-social-${T}`, KW = `menu${T % 100000}`;
let pool: Pool, wsId = "";

function post(request: import("@playwright/test").APIRequestContext, payload: unknown) {
  const body = JSON.stringify(payload);
  const sig = "sha256=" + createHmac("sha256", process.env.IG_APP_SECRET ?? "nbo-e2e-ig-secret").update(body).digest("hex");
  return request.post("/api/webhooks/instagram", { data: body, headers: { "Content-Type": "application/json", "x-hub-signature-256": sig } });
}
const comment = (from: string, user: string, id: string, text: string) => ({
  object: "instagram", entry: [{ id: ACCT, time: Date.now(), changes: [{ field: "comments", value: { id, text, from: { id: from, username: user }, media: { id: `media-${T}` } } }] }],
});
async function login(page: import("@playwright/test").Page, email = EMAIL, pass = PASS) {
  await page.goto("/login"); await page.fill("#email", email); await page.fill("#password", pass);
  await Promise.all([page.click("button[type=submit]"), page.waitForURL((u) => !u.pathname.startsWith("/login"))]);
}
type Row = { id: string; text: string; state: string };
async function comments(page: import("@playwright/test").Page, filter = "all") {
  return ((await (await page.request.get(`/api/instagram/comments?filter=${filter}`)).json()) as { comments: Row[]; counts: Record<string, number> });
}

test.describe.serial("NextBiz Social", () => {
  test.beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    wsId = (await pool.query(`INSERT INTO workspaces (name) VALUES ($1) RETURNING id`, [`Social Shop ${T}`])).rows[0].id;
    await pool.query(`INSERT INTO users (workspace_id, email, password_hash, display_name, is_operator, is_approved) VALUES ($1, $2, $3, 'Social Owner', false, true)`, [wsId, EMAIL, await hash(PASS, 4)]);
    await pool.query(`INSERT INTO ig_accounts (workspace_id, ig_user_id, username, live, webhook_subscribed) VALUES ($1, $2, 'e2e_bakery', true, true)`, [wsId, ACCT]);
  });
  test.afterAll(async () => {
    await pool.query(`DELETE FROM ig_webhook_events WHERE ig_event_id LIKE $1`, [`${ACCT}:%`]).catch(() => {});
    await pool.query(`DELETE FROM workspaces WHERE id = $1`, [wsId]).catch(() => {});
    await pool.query(`DELETE FROM users WHERE email = $1`, [EMAIL]).catch(() => {});
    await pool.end();
  });

  test("comments arrive; a rule answers one, the other needs a reply", async ({ page }) => {
    await login(page);
    const r = await page.request.post("/api/automation/rules", { data: { name: `Menu ${T}`, keywords: [KW], reply: "Here's our menu!", onWhatsapp: false, onInstagramDm: false, onInstagramComment: true, commentPublicReply: "Sent you a DM 💌" } });
    expect(r.status()).toBe(201);
    expect((await post(page.request, comment("fan-1", "hungry_fan", `c1-${T}`, `can I see the ${KW}?`))).status()).toBe(200);
    expect((await post(page.request, comment("fan-2", "curious_cat", `c2-${T}`, "do you deliver to Salt Lake?"))).status()).toBe(200);
    // our own reply coming back as a comment must not show up
    expect((await post(page.request, comment(ACCT, "e2e_bakery", `c3-${T}`, "Sent you a DM 💌"))).status()).toBe(200);
    await expect.poll(async () => (await comments(page)).counts.all).toBe(2);
    const all = await comments(page);
    expect(all.comments.find((c) => c.text.includes(KW))?.state).toBe("auto");
    expect(all.comments.find((c) => c.text.includes("Salt Lake"))?.state).toBe("needs");
    expect(all.counts.needs).toBe(1);
  });

  test("overview shows the account and what needs a reply", async ({ page }) => {
    await login(page);
    await page.goto("/social");
    await expect(page.getByTestId("social-overview")).toBeVisible();
    await expect(page.locator(".sx-id h1")).toHaveText("@e2e_bakery");
    await expect(page.getByTestId("kpi-needs").locator(".v")).toHaveText("1");
    await expect(page.getByTestId("rail-social")).toHaveClass(/on/);
  });

  test("comments page: reply publicly, then the one allowed private DM", async ({ page }) => {
    await login(page);
    await page.goto("/social/comments");
    await expect(page.getByTestId("crow-comment")).toHaveCount(1); // Needs reply filter by default
    await page.getByTestId("crow-comment").first().click();
    await expect(page.locator(".ig-c.on")).toContainText("Salt Lake");
    await page.getByTestId("kind-public").click();
    await page.getByTestId("comment-reply").fill("Yes! Salt Lake is in our zone 🚚");
    await page.getByTestId("comment-send").click();
    await expect(page.locator(".ccomposer .note.ok")).toBeVisible();
    await expect(page.locator(".ig-c.on .ig-r")).toContainText("Salt Lake is in our zone");
    expect((await comments(page, "needs")).counts.needs).toBe(0);

    // private DM: allowed once, opens a DM thread
    await page.getByTestId("kind-private").click();
    await page.getByTestId("comment-reply").fill("Sharing our delivery slots here");
    await page.getByTestId("comment-send").click();
    await expect(page.locator(".ccomposer .note.ok")).toContainText("Private DM sent");
    await expect(page.getByTestId("kind-private")).toBeDisabled();
    const id = (await comments(page)).comments.find((c) => c.text.includes("Salt Lake"))!.id;
    const again = await page.request.post(`/api/instagram/comments/${id}/reply`, { data: { kind: "private", text: "again?" } });
    expect(again.status()).toBe(409);
    const threads = (await (await page.request.get("/api/instagram/threads")).json()) as { threads: { igsid: string }[] };
    expect(threads.threads.some((t) => t.igsid === "fan-2")).toBe(true);
  });

  test("dismiss and undo", async ({ page }) => {
    await login(page);
    expect((await post(page.request, comment("fan-3", "just_looking", `c4-${T}`, "nice pics"))).status()).toBe(200);
    await expect.poll(async () => (await comments(page, "needs")).counts.needs).toBe(1);
    await page.goto("/social/comments");
    await page.getByTestId("crow-comment").first().click();
    await page.getByTestId("dismiss").click();
    await expect.poll(async () => (await comments(page, "needs")).counts.needs).toBe(0);
    const id = (await comments(page)).comments.find((c) => c.text === "nice pics")!.id;
    await page.request.post(`/api/instagram/comments/${id}/dismiss`, { data: { undo: true } });
    expect((await comments(page, "needs")).counts.needs).toBe(1);
  });

  test("another workspace sees none of it", async ({ page }) => {
    await login(page);
    const id = (await comments(page)).comments[0].id;
    await page.context().clearCookies();
    await login(page, process.env.OPERATOR_EMAIL ?? "operator@nextbiz.one", process.env.OPERATOR_PASS ?? "operator-test-pass");
    expect((await page.request.get(`/api/instagram/comments/${id}`)).status()).toBe(404);
    expect((await page.request.post(`/api/instagram/comments/${id}/reply`, { data: { kind: "public", text: "x" } })).status()).toBe(404);
    expect((await page.request.post(`/api/instagram/comments/${id}/dismiss`, { data: {} })).status()).toBe(404);
    const list = await comments(page);
    expect(list.comments.some((c) => c.id === id)).toBe(false);
  });
});
