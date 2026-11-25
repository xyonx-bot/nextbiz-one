import { createHmac } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";

/**
 * Switching and disconnecting channels: the old Instagram account's chats leave every screen, nothing can be sent or
 * received on it, its data can be deleted, one Instagram message is stored once whatever id it arrives with,
 * WhatsApp Disconnect works in any letter case, the open dashboard updates itself.
 */
const DB = process.env.DATABASE_URL ?? "";
if (DB.includes("one-db:5432") || DB.includes("one.nextbizstudio.com")) { console.error("[PROD GUARD] aborted."); process.exit(0); }
const pool = new Pool({ connectionString: DB });
const SECRET = process.env.IG_APP_SECRET ?? "nbo-e2e-ig-secret", WA_SECRET = process.env.WHATSAPP_APP_SECRET ?? "nbo-e2e-secret";
const PNID = process.env.PHONE_NUMBER_ID ?? "PNID";
const T = Date.now(), OLD = `98${T}`, NEW = `99${T}`, FAN = `fan_${T}`;
let wsId = "", oldId = "", newId = "", oldThread = "";

async function login(page: Page) {
  await page.goto("/login");
  await page.fill("#email", process.env.OPERATOR_EMAIL ?? "operator@nextbiz.one");
  await page.fill("#password", process.env.OPERATOR_PASS ?? "operator-test-pass");
  await Promise.all([page.click("button[type=submit]"), page.waitForURL("**/")]);
}
const sign = (b: string, s: string) => "sha256=" + createHmac("sha256", s).update(b).digest("hex");
/** Meta's id format: base64 with "Z" escaped as ZA and "=" as ZD. */
const metaId = (kind: "ig_dm_item" | "new_ig_dm_item", acct: string, n: string) =>
  Buffer.from(`${kind}:1:IGMessageID:${acct}:3402823668:${n}`).toString("base64").replace(/Z/g, "ZA").replace(/\+/g, "ZB").replace(/\//g, "ZC").replace(/=/g, "ZD");
const dmBody = (acct: string, mid: string, text: string, echo = false) => JSON.stringify({ object: "instagram", entry: [{ id: acct, time: Date.now(), messaging: [{
  sender: { id: echo ? acct : FAN, username: echo ? undefined : FAN }, recipient: { id: echo ? FAN : acct }, timestamp: String(Date.now()), message: { mid, text, ...(echo ? { is_echo: true } : {}) } }] }] });
const postIg = (page: Page, b: string) => page.request.post("/api/webhooks/instagram", { data: b, headers: { "content-type": "application/json", "x-hub-signature-256": sign(b, SECRET) } });

test.describe.serial("switching and disconnecting channels", () => {
  test.beforeAll(async () => {
    wsId = (await pool.query(`SELECT workspace_id FROM users WHERE lower(email) = lower($1)`, [process.env.OPERATOR_EMAIL ?? "operator@nextbiz.one"])).rows[0]?.workspace_id
      ?? (await pool.query(`SELECT id FROM workspaces WHERE name = 'NextBiz One'`)).rows[0].id;
    await pool.query(`UPDATE ig_accounts SET live = false WHERE workspace_id = $1`, [wsId]);
    const acct = async (id: string, name: string, live: boolean) =>
      (await pool.query(`INSERT INTO ig_accounts (workspace_id, ig_user_id, username, live) VALUES ($1, $2, $3, $4) RETURNING id`, [wsId, id, name, live])).rows[0].id as string;
    oldId = await acct(OLD, `old_${T}`, false); newId = await acct(NEW, `new_${T}`, true);
    oldThread = (await pool.query(`INSERT INTO ig_threads (workspace_id, ig_account_id, igsid, username, last_inbound_at) VALUES ($1, $2, 'c1', $3, now()) RETURNING id`, [wsId, oldId, `oldcustomer_${T}`])).rows[0].id;
    await pool.query(`INSERT INTO ig_messages (workspace_id, ig_account_id, thread_id, mid, sender_id, body, raw) VALUES ($1, $2, $3, $4, 'c1', 'hello old account', '{}')`, [wsId, oldId, oldThread, `old-${T}`]);
  });
  test.afterAll(async () => {
    await pool.query(`DELETE FROM ig_accounts WHERE ig_user_id = ANY($1)`, [[OLD, NEW]]);
    await pool.query(`UPDATE waba_connections SET status = 'connected' WHERE phone_number_id = $1`, [PNID]);
    await pool.end();
  });

  test("the old account's chats show nowhere", async ({ page }) => {
    await login(page);
    for (const path of ["/", "/inbox", "/social", "/social/dms"]) {
      await page.goto(path); await page.waitForTimeout(800);
      expect(await page.textContent("body"), path).not.toContain(`oldcustomer_${T}`);
    }
    const th = await (await page.request.get("/api/instagram/threads")).json();
    expect(th.threads.some((t: { id: string }) => t.id === oldThread)).toBe(false);
    expect((await page.request.get(`/api/instagram/threads/${oldThread}`)).status()).toBe(404);
  });

  test("a reply on the old account is refused, not reported as sent", async ({ page }) => {
    await login(page);
    const r = await page.request.post(`/api/instagram/threads/${oldThread}/messages`, { data: { body: "hi" } });
    expect(r.status()).toBe(409);
    expect((await pool.query(`SELECT count(*)::int AS n FROM ig_messages WHERE thread_id = $1`, [oldThread])).rows[0].n).toBe(1);
  });

  test("a DM for a disconnected account is dropped, its text isn't kept", async ({ page }) => {
    const r = await postIg(page, dmBody(OLD, `late-${T}`, "secret after disconnect"));
    expect(r.status()).toBe(200);
    expect((await pool.query(`SELECT 1 FROM ig_messages WHERE mid = $1`, [`late-${T}`])).rowCount).toBe(0);
    expect(JSON.stringify((await pool.query(`SELECT body FROM ig_webhook_events WHERE ig_event_id = $1`, [`${OLD}:late-${T}`])).rows[0].body)).toBe("{}");
  });

  test("one Instagram message with two ids is stored once", async ({ page }) => {
    const hook = metaId("new_ig_dm_item", NEW, `32145${T}`), api = metaId("ig_dm_item", NEW, `32145${T}`);
    expect(hook).not.toBe(api);
    await postIg(page, dmBody(NEW, hook, "only once please"));
    // what the API sync inserts for the same message
    const ins = await pool.query(
      `INSERT INTO ig_messages (workspace_id, ig_account_id, thread_id, mid, sender_id, body, raw) SELECT workspace_id, ig_account_id, thread_id, $2, sender_id, body, '{}' FROM ig_messages WHERE mid = $1 ON CONFLICT DO NOTHING`, [hook, api]);
    expect(ins.rowCount).toBe(0);
    await postIg(page, dmBody(NEW, metaId("new_ig_dm_item", NEW, `32146${T}`), "only once please")); // same text again = a new message
    expect((await pool.query(`SELECT count(*)::int AS n FROM ig_messages WHERE ig_account_id = $1 AND body = 'only once please'`, [newId])).rows[0].n).toBe(2);
  });

  test("the echo of our own reply isn't a second message and doesn't change who sent it", async ({ page }) => {
    await login(page);
    const th = (await pool.query(`SELECT id FROM ig_threads WHERE ig_account_id = $1 AND igsid = $2`, [newId, FAN])).rows[0].id;
    const s = await (await page.request.post(`/api/instagram/threads/${th}/messages`, { data: { body: "our answer" } })).json();
    await postIg(page, dmBody(NEW, s.mid, "our answer", true));
    const rows = (await pool.query(`SELECT origin FROM ig_messages WHERE thread_id = $1 AND body = 'our answer'`, [th])).rows;
    expect(rows).toEqual([{ origin: "app" }]);
  });

  test("hide, unhide and delete a comment", async ({ page }) => {
    await login(page);
    const id = (await pool.query(`INSERT INTO ig_comments (ig_account_id, comment_id, from_id, from_name, text, raw) VALUES ($1, $2, 'u9', $3, 'rude words', '{}') RETURNING id`, [newId, `cm-${T}`, `rude_${T}`])).rows[0].id;
    await page.goto(`/social/comments?c=${id}`);
    await page.getByTestId("c-hide").click();
    await expect(page.locator(".ccomposer [role=status]")).toContainText("Hidden on Instagram");
    await expect(page.getByTestId("c-hide")).toContainText("Unhide");
    await page.getByTestId("c-hide").click();
    await expect(page.getByTestId("c-hide")).toContainText("Hide");
    await page.getByTestId("c-delete").click();
    await page.getByTestId("c-delete-confirm").click();
    await expect.poll(async () => (await pool.query(`SELECT 1 FROM ig_comments WHERE id = $1`, [id])).rowCount).toBe(0);
  });

  test("a disconnected account's data can be deleted; a connected one's can't", async ({ page }) => {
    await login(page);
    expect((await page.request.delete(`/api/instagram/accounts/${newId}`, { data: { confirm: "DELETE" } })).status()).toBe(404);
    expect((await page.request.delete(`/api/instagram/accounts/${oldId}`, { data: {} })).status()).toBe(400);
    await page.goto("/connections");
    const row = page.locator(".cc-pr", { hasText: `old_${T}` });
    await row.getByTestId("ig-past-delete").click();
    await expect(page.getByTestId("ig-past")).toContainText("1 chat, 1 message");
    await page.getByTestId("ig-past-confirm").click();
    await expect(page.getByRole("status")).toContainText("was deleted");
    for (const t of ["ig_accounts WHERE id", "ig_threads WHERE ig_account_id", "ig_messages WHERE ig_account_id"])
      expect((await pool.query(`SELECT 1 FROM ${t} = $1`, [oldId])).rowCount, t).toBe(0);
    expect((await pool.query(`SELECT 1 FROM ig_webhook_events WHERE ig_event_id LIKE $1`, [`${OLD}:%`])).rowCount).toBe(0);
  });

  test("Instagram disconnect asks first, then clears it", async ({ page }) => {
    await login(page);
    await page.goto("/connections");
    await page.getByTestId("ig-disconnect").click();
    await page.getByTestId("ig-disconnect-confirm").click();
    await expect(page.getByRole("status")).toContainText("Instagram disconnected");
    await expect(page.getByTestId("cc-instagram")).toContainText("Not connected");
    expect((await pool.query(`SELECT live FROM ig_accounts WHERE id = $1`, [newId])).rows[0].live).toBe(false);
  });

  test("WhatsApp: a resent message gets one auto-reply", async ({ page }) => {
    const from = `9177${String(T).slice(-8)}`;
    const b = JSON.stringify({ object: "whatsapp_business_account", entry: [{ changes: [{ value: { metadata: { phone_number_id: PNID }, contacts: [{ wa_id: from, profile: { name: "Resend" } }],
      messages: [{ from, id: `wamid.resend-${T}`, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: "hello there" } }] } }] }] });
    const post = () => page.request.post("/api/webhooks/whatsapp", { data: b, headers: { "content-type": "application/json", "x-hub-signature-256": sign(b, WA_SECRET) } });
    expect((await (await post()).json()).stored).toBe(1);
    await page.waitForTimeout(600);
    const tries = async () => (await pool.query(`SELECT count(*)::int AS n FROM automation_log l JOIN contacts c ON c.id = l.contact_id WHERE c.wa_id = $1`, [from])).rows[0].n as number;
    const before = await tries();
    expect((await (await post()).json()).stored).toBe(0);
    await page.waitForTimeout(600);
    expect(await tries()).toBe(before);
  });

  test("WhatsApp: lowercase + a space disconnects; an open dashboard updates itself; messages stop; own number reconnects", async ({ page, context }) => {
    await login(page);
    const dash = page; await dash.goto("/");
    await expect(dash.locator(".chi.on.wa")).toHaveCount(1);
    const conn = await context.newPage(); await conn.goto("/connections");
    await conn.getByTestId("wa-disconnect").click();
    const btn = conn.getByTestId("wa-disconnect-confirm");
    await expect(btn).toBeDisabled();
    await conn.getByLabel("Type DISCONNECT to confirm").pressSequentially("disconnec");
    await expect(btn).toBeDisabled();
    await conn.getByLabel("Type DISCONNECT to confirm").pressSequentially("t ");
    await expect(btn).toBeEnabled();
    await btn.click();
    await expect(conn.getByRole("status")).toContainText("WhatsApp disconnected");
    await expect(conn.getByTestId("cc-whatsapp")).toContainText("Not connected");
    await expect(dash.locator(".chi.on.wa")).toHaveCount(0, { timeout: 8000 }); // no reload

    const from = `9166${String(T).slice(-8)}`;
    const b = JSON.stringify({ object: "whatsapp_business_account", entry: [{ changes: [{ value: { metadata: { phone_number_id: PNID }, messages: [{ from, id: `wamid.off-${T}`, timestamp: "1", type: "text", text: { body: "anyone?" } }] } }] }] });
    const r = await page.request.post("/api/webhooks/whatsapp", { data: b, headers: { "content-type": "application/json", "x-hub-signature-256": sign(b, WA_SECRET) } });
    expect((await r.json()).stored).toBe(0);
    expect((await pool.query(`SELECT 1 FROM contacts WHERE wa_id = $1`, [from])).rowCount).toBe(0);

    await conn.getByTestId("wa-reconnect").click();
    await expect(conn.getByRole("status")).toContainText("connected again");
    await expect(conn.getByTestId("cc-whatsapp")).toContainText("Live");
  });
});
