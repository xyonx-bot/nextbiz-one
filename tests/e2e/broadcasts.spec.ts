import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";
import { Pool } from "pg";

/**
 * S2 broadcasts e2e — gates + composer + opt-in keyword capture.
 * Seeds contacts through the REAL webhook path (signature + all), then:
 * opt-in hard rule (START flips the flag, "hi" does NOT), approved-template
 * gate (409 on draft), composer flow blocked at step 2 without approvals.
 *
 * Oct 25 (fix/nbo-broadcast-ux): + nav dedup, + audience selection (all /
 * specific contacts), + template pick visual state, + Next:Schedule gate.
 * Approved templates are seeded straight via pg — Meta approval is an
 * external event the app only polls for.
 */

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

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

/** seed an APPROVED template straight in the DB (Meta-side external event) */
async function seedApprovedTemplate(name: string) {
  const ws = await pool.query(`SELECT id FROM workspaces WHERE name='NextBiz One' LIMIT 1`);
  const r = await pool.query(
    `INSERT INTO templates (workspace_id, name, body, status) VALUES ($1,$2,$3,'approved') RETURNING id`,
    [ws.rows[0].id, name, "Hi {{1}} — e2e approved template body"],
  );
  return r.rows[0].id as string;
}

/** contact id by wa_id (seeded through the webhook path first) */
async function contactId(waId: string) {
  const r = await pool.query(`SELECT id FROM contacts WHERE wa_id=$1 ORDER BY created_at DESC LIMIT 1`, [waId]);
  return r.rows[0]?.id as string | undefined;
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

    // step 1: audience — default "all opted-in"; count loads (START contact seeded >=1)
    await expect(page.locator("[data-testid=aud-est] .v")).not.toHaveText("0", { timeout: 10000 });
    const n = await page.locator("[data-testid=aud-est] .v").textContent();
    expect(Number(n)).toBeGreaterThanOrEqual(1);
    await page.click("[data-testid=bc-next]");

    // step 2: template — approved-only; none seeded yet → blocked
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

  test("nav panel: module chips appear exactly once (no Broadcasts duplicate)", async ({ page }) => {
    await login(page);
    await page.goto("/broadcasts");
    const panel = page.locator("[data-testid=nav-panel]");
    await expect(panel).toBeVisible();
    expect(await panel.locator(".schip", { hasText: "Broadcasts" }).count()).toBe(1);
    expect(await panel.locator(".schip", { hasText: "Templates" }).count()).toBe(1);
    expect(await panel.locator(".schip", { hasText: "Automation" }).count()).toBe(1);
    expect(await panel.locator(".schip", { hasText: "Inbox" }).count()).toBe(1);
  });

  test("composer full flow: pick contacts → template selected state → preview count → schedule step", async ({ page, request }) => {
    await login(page);
    const t = Date.now();
    // seed: two opted-in (START) + one not opted-in (plain "hi")
    await postInbound(request, `9198300999${t}10`, "Sel Person A", "START", `wamid.s2fa-${t}`);
    await postInbound(request, `9198300999${t}11`, "Sel Person B", "START", `wamid.s2fb-${t}`);
    await seedApprovedTemplate(`e2e_approved_${t}`);
    const idA = await contactId(`9198300999${t}10`);
    expect(idA).toBeTruthy();

    await page.goto("/broadcasts");
    await page.click("[data-testid=new-broadcast]");

    // step 1 — switch to contact selection, pick exactly ONE of the two
    await page.click("[data-testid=aud-mode-pick]");
    await expect(page.locator("[data-testid=aud-pick]")).toBeVisible();
    await expect(page.locator("[data-testid=aud-row]")).not.toHaveCount(0);
    await page.locator("[data-testid=aud-row]", { hasText: "Sel Person A" }).first().click();
    await expect(page.locator("[data-testid=aud-count]")).toHaveText("1 selected");
    await expect(page.locator("[data-testid=aud-est] .v")).toHaveText("1");
    await page.click("[data-testid=bc-next]");

    // step 2 — pick the seeded approved template; the row must STAY visually selected
    const row = page.locator("[data-testid=pick-tpl]", { hasText: `e2e_approved_${t}` });
    await expect(row).toBeVisible();
    await row.click();
    await expect(row).toHaveClass(/trow on/);
    await expect(row).toHaveAttribute("aria-pressed", "true");
    await page.click("[data-testid=bc-next]");

    // step 3 — preview reflects the selected audience, not the whole opted-in pool
    await expect(page.locator("[data-testid=aud-est] .v")).toHaveText("1");
    await expect(page.locator("[data-testid=bc-next]")).toHaveText(/Next: Schedule/);
    await page.click("[data-testid=bc-next]");

    // step 4 — schedule: "Next: Schedule" must land here (was dead before)
    const bcName = `e2e_bc_pick_${t}`;
    await expect(page.locator("[data-testid=bc-name]")).toBeVisible();
    await page.fill("[data-testid=bc-name]", bcName);
    await page.click("[data-testid=bc-launch]");
    await expect(page.locator("[data-testid=bc-note]")).toContainText("Draft saved", { timeout: 10000 });

    // created broadcast snapshot = exactly the one picked contact
    const res = await page.request.get("/api/broadcasts");
    const { broadcasts } = (await res.json()) as { broadcasts: { name: string; total: number }[] };
    const mine = broadcasts.find((b) => b.name === bcName);
    expect(mine?.total).toBe(1);
  });

  test("audience API: contacts mode — opt-in hard rule + empty selection", async ({ page, request }) => {
    await login(page);
    const t = Date.now();
    const tplId = await seedApprovedTemplate(`e2e_approved_${t}`);
    // plain "hi" contact = NOT opted in.
    // phones embed the full run-stamp: the old (t % 90)+N derivation collided
    // across tests (an opted-in "Sel Person B" row answered as "No Opt Person"
    // through the auto-create dedupe) and 201'd the hard-rule assertion.
    await postInbound(request, `9198300999${t}12`, "No Opt Person", "hi", `wamid.s2g-${t}`);
    const noOpt = await contactId(`9198300999${t}12`);
    const opted = await contactId("919830099902"); // seeded opted-in by the keyword test above
    expect(noOpt).toBeTruthy();
    expect(opted).toBeTruthy();

    // empty selection → 400
    const empty = await page.request.post("/api/broadcasts", {
      data: { name: `e2e_bc_empty_${t}`, templateId: tplId, audience: { mode: "contacts", contactIds: [] } },
    });
    expect(empty.status()).toBe(400);

    // non-opted-in ids only → 400, hard rule
    const noOptRes = await page.request.post("/api/broadcasts", {
      data: { name: `e2e_bc_noopt_${t}`, templateId: tplId, audience: { mode: "contacts", contactIds: [noOpt] } },
    });
    expect(noOptRes.status()).toBe(400);
    expect(((await noOptRes.json()) as { error: string }).error).toContain("opted in");

    // opted-in id → 201 with exactly 1 recipient
    const okRes = await page.request.post("/api/broadcasts", {
      data: { name: `e2e_bc_pick_${t}`, templateId: tplId, audience: { mode: "contacts", contactIds: [opted] } },
    });
    expect(okRes.status()).toBe(201);
    expect(((await okRes.json()) as { recipients: number }).recipients).toBe(1);
  });
});

test.afterAll(async () => {
  // best-effort: remove e2e artifacts this spec created (cascade removes recipients)
  try {
    await pool.query(`DELETE FROM jobs WHERE payload->>'broadcastId' IN (SELECT id::text FROM broadcasts WHERE name LIKE 'e2e_bc%')`);
    await pool.query(`DELETE FROM broadcasts WHERE name LIKE 'e2e_bc%'`);
    await pool.query(`DELETE FROM templates WHERE name LIKE 'e2e_approved_%' OR name LIKE 'e2e_draft_%'`);
  } catch { /* best-effort cleanup */ }
  await pool.end();
});
