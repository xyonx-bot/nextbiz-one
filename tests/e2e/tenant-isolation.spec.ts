import { expect, test } from "@playwright/test";
import { Pool } from "pg";
import { hash } from "bcryptjs";

/**
 * Workspace isolation — a client workspace must never see or change another workspace's data.
 * Creates a fresh client workspace + user directly in the (non-prod) test DB, then checks every list
 * is empty for it and every foreign id answers 404. Also: pages without a connected channel show the
 * guided setup state, and Connections renders for the client. PROD GUARD like the other specs.
 */
const PROD_DB_URL = process.env.DATABASE_URL ?? "";
if (PROD_DB_URL.includes("one-db:5432") || PROD_DB_URL.includes("one.nextbizstudio.com")) {
  console.error("[PROD GUARD] DATABASE_URL points to production. E2E suite aborted.");
  process.exit(0);
}

const T = Date.now();
const EMAIL = `iso-${T}@e2e.test`, PASS = `iso-pass-${T}`;
let pool: Pool;
let wsId = "";
const foreign = { conv: "", contact: "", template: "", broadcast: "", rule: "", igThread: "" };

async function loginAs(page: import("@playwright/test").Page, email: string, pass: string) {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", pass);
  await Promise.all([page.click("button[type=submit]"), page.waitForURL((u) => !u.pathname.startsWith("/login"))]);
}

test.describe.serial("workspace isolation", () => {
  test.beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    wsId = (await pool.query(`INSERT INTO workspaces (name) VALUES ($1) RETURNING id`, [`Iso Shop ${T}`])).rows[0].id;
    await pool.query(
      `INSERT INTO users (workspace_id, email, password_hash, display_name, is_operator, is_approved) VALUES ($1, $2, $3, 'Iso Owner', false, true)`,
      [wsId, EMAIL, await hash(PASS, 4)]);
    // ids that belong to OTHER workspaces (the operator's data in this test DB)
    const one = async (sql: string) => (await pool.query(sql, [wsId])).rows[0]?.id ?? "";
    foreign.conv = await one(`SELECT id FROM conversations WHERE workspace_id <> $1 LIMIT 1`);
    foreign.contact = await one(`SELECT id FROM contacts WHERE workspace_id <> $1 LIMIT 1`);
    foreign.template = await one(`SELECT id FROM templates WHERE workspace_id <> $1 LIMIT 1`);
    foreign.broadcast = await one(`SELECT id FROM broadcasts WHERE workspace_id <> $1 LIMIT 1`);
    foreign.rule = await one(`SELECT id FROM keyword_rules WHERE workspace_id <> $1 LIMIT 1`);
    foreign.igThread = await one(`SELECT id FROM ig_threads WHERE workspace_id <> $1 LIMIT 1`);
  });

  test.afterAll(async () => {
    await pool.query(`DELETE FROM workspaces WHERE id = $1`, [wsId]).catch(() => {});
    await pool.query(`DELETE FROM users WHERE email = $1`, [EMAIL]).catch(() => {});
    await pool.end();
  });

  test("lists are empty for a new workspace", async ({ page }) => {
    await loginAs(page, EMAIL, PASS);
    const get = async (u: string) => (await (await page.request.get(u)).json()) as Record<string, unknown[] | unknown>;
    expect((await get("/api/conversations")).conversations).toEqual([]);
    expect((await get("/api/contacts")).contacts).toEqual([]);
    expect((await get("/api/templates")).templates).toEqual([]);
    expect((await get("/api/broadcasts")).broadcasts).toEqual([]);
    expect((await get("/api/instagram/threads")).threads).toEqual([]);
    const auto = await get("/api/automation");
    expect(auto.rules).toEqual([]); expect(auto.faq).toEqual([]); expect(auto.log).toEqual([]);
    const prof = (await get("/api/settings/profile")).profile as { name: string; connection: unknown };
    expect(prof.name).toBe(`Iso Shop ${T}`);
    expect(prof.connection).toBeNull();
    const onb = await get("/api/onboarding/status");
    expect(onb.connected).toBe(false); expect(onb.inboundCount).toBe(0);
    const csv = await (await page.request.get("/api/settings/export?dataset=contacts")).text();
    expect(csv.trim().split("\n")).toHaveLength(1); // header only
  });

  test("foreign ids answer 404 and change nothing", async ({ page }) => {
    await loginAs(page, EMAIL, PASS);
    const r = page.request;
    if (foreign.conv) {
      expect((await r.get(`/api/conversations/${foreign.conv}`)).status()).toBe(404);
      expect((await r.post(`/api/conversations/${foreign.conv}/read`)).status()).toBe(404);
      expect((await r.post(`/api/conversations/${foreign.conv}/messages`, { data: { body: "leak?" } })).status()).toBe(404);
    }
    if (foreign.template) expect((await r.patch(`/api/templates/${foreign.template}`, { data: { body: "hijack" } })).status()).toBe(404);
    if (foreign.broadcast) expect((await r.get(`/api/broadcasts/${foreign.broadcast}/recipients`)).status()).toBe(404);
    if (foreign.rule) {
      expect((await r.patch(`/api/automation/rules/${foreign.rule}`, { data: { enabled: false } })).status()).toBe(404);
      await r.delete(`/api/automation/rules/${foreign.rule}`);
      expect((await pool.query(`SELECT 1 FROM keyword_rules WHERE id = $1`, [foreign.rule])).rowCount).toBe(1); // still there
    }
    if (foreign.igThread) {
      expect((await r.get(`/api/instagram/threads/${foreign.igThread}`)).status()).toBe(404);
      expect((await r.post(`/api/instagram/threads/${foreign.igThread}/messages`, { data: { body: "leak?" } })).status()).toBe(404);
    }
    // a broadcast can't use another workspace's template
    if (foreign.template) expect((await r.post(`/api/broadcasts`, { data: { name: `iso ${T}`, templateId: foreign.template } })).status()).toBe(404);
  });

  test("pages without a channel show the guided setup state", async ({ page }) => {
    await loginAs(page, EMAIL, PASS);
    for (const [path, feature] of [["/inbox", "inbox"], ["/templates", "templates"], ["/broadcasts", "broadcasts"], ["/automation", "automation"], ["/contacts", "contacts"], ["/ads", "ads"]] as const) {
      await page.goto(path);
      const gate = page.getByTestId("channel-gate");
      await expect(gate).toBeVisible();
      await expect(gate).toHaveAttribute("data-feature", feature);
    }
    await expect(page.getByTestId("gate-demo")).toBeVisible();
    await page.getByTestId("gate-demo").click();
    await page.waitForURL("**/ads");
    await expect(page.getByTestId("channel-gate")).toHaveCount(0); // demo mode opens the mock-badged ads
  });

  test("connections page lists all three channels for the client", async ({ page }) => {
    await loginAs(page, EMAIL, PASS);
    await page.goto("/connections");
    await expect(page.getByTestId("cc-whatsapp")).toBeVisible();
    await expect(page.getByTestId("cc-instagram")).toBeVisible();
    await expect(page.getByTestId("cc-ads")).toBeVisible();
    await expect(page.getByTestId("cc-whatsapp")).toHaveAttribute("data-state", /ready|soon/);
    // Embedded Signup completion refuses without config / with junk input — never touches another workspace
    const es = await page.request.post("/api/whatsapp/embedded-signup", { data: { code: "x".repeat(20) } });
    expect([409, 502]).toContain(es.status());
  });
});
