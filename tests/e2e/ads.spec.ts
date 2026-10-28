import { expect, test } from "@playwright/test";
import { Pool } from "pg";

/**
 * Ads module e2e (P2.1–P2.3, mock-badged — Meta audit Oct 27: no ad account,
 * no ads_read). API contracts: gated endpoints, deterministic demo fixtures,
 * draft creation roundtrip, demo read-only, performance series.
 *
 * PROD GUARD: this spec MUST NOT run against production. If DATABASE_URL
 * contains the prod host (one-db:5432 / one.nextbizstudio.com), exit.
 */
const PROD_DB_URL = process.env.DATABASE_URL ?? "";
if (PROD_DB_URL.includes("one-db:5432") || PROD_DB_URL.includes("one.nextbizstudio.com")) {
  console.error("[PROD GUARD] DATABASE_URL points to production. E2E suite aborted.");
  process.exit(0);
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.fill("#email", process.env.OPERATOR_EMAIL ?? "operator@nextbiz.one");
  await page.fill("#password", process.env.OPERATOR_PASS ?? "operator-test-pass");
  await Promise.all([page.click("button[type=submit]"), page.waitForURL("**/")]);
}

type C = { id: string; name: string; status: string; source: string; insights: { spend: number } };
type List = { ok: boolean; demo: boolean; campaigns: C[] };

test.describe("Ads module (P2 mock)", () => {
  test("unauthenticated ads endpoints are 401", async ({ request }) => {
    expect((await request.get("/api/ads/campaigns")).status()).toBe(401);
    expect((await request.get("/api/ads/performance")).status()).toBe(401);
    expect((await request.post("/api/ads/campaigns", {
      data: { name: "x", objective: "OUTCOME_LEADS", daily_budget: 100, destination: "whatsapp" },
    })).status()).toBe(401);
  });

  test("list: demo fixtures, deterministic, searchable, detail has insights", async ({ page }) => {
    await login(page);
    const d = (await (await page.request.get("/api/ads/campaigns")).json()) as List;
    expect(d.ok).toBe(true);
    expect(d.demo).toBe(true); // mock badge flag — the backlog's live-vs-mock contract
    expect(d.campaigns.length).toBeGreaterThanOrEqual(7);
    expect(d.campaigns.filter((c) => c.source === "demo").length).toBe(7);

    const again = (await (await page.request.get("/api/ads/campaigns")).json()) as List;
    expect(again.campaigns.map((c) => c.id)).toEqual(d.campaigns.map((c) => c.id)); // stable

    const search = (await (await page.request.get("/api/ads/campaigns?q=festive")).json()) as List;
    expect(search.campaigns.length).toBe(1);
    expect(search.campaigns[0].name.toLowerCase()).toContain("festive");

    const demoId = d.campaigns.find((c) => c.id.startsWith("demo-"))!.id;
    const one = (await (await page.request.get(`/api/ads/campaigns/${demoId}`)).json()) as { campaign: C };
    expect(one.campaign.insights.spend).toBeGreaterThan(0);
  });

  test("creation roundtrip: draft + submit, pause/resume, demo read-only", async ({ page }) => {
    await login(page);
    const t = Date.now();
    const draftRes = await page.request.post("/api/ads/campaigns", {
      data: { name: `e2e_ads_${t}`, objective: "OUTCOME_LEADS", daily_budget: 500,
        destination: "whatsapp", creative_headline: "Test headline", submit: false },
    });
    expect(draftRes.status()).toBe(201);
    const draft = ((await draftRes.json()) as { campaign: C }).campaign;
    expect(draft.status).toBe("DRAFT");
    expect(draft.source).toBe("draft");

    const sub = ((await (await page.request.post("/api/ads/campaigns", {
      data: { name: `e2e_ads_sub_${t}`, objective: "OUTCOME_SALES", daily_budget: 700,
        destination: "website", submit: true },
    })).json()) as { campaign: C }).campaign;
    expect(sub.status).toBe("IN_REVIEW");

    const paused = ((await (await page.request.patch(`/api/ads/campaigns/${sub.id}`, {
      data: { status: "paused" },
    })).json()) as { campaign: C }).campaign;
    expect(paused.status).toBe("PAUSED");

    const list = (await (await page.request.get("/api/ads/campaigns")).json()) as List;
    expect(list.campaigns.some((c) => c.id === draft.id)).toBe(true);
    expect(list.campaigns.some((c) => c.id === sub.id)).toBe(true);

    const demoId = list.campaigns.find((c) => c.id.startsWith("demo-"))!.id;
    expect((await page.request.patch(`/api/ads/campaigns/${demoId}`, { data: { status: "paused" } })).status()).toBe(409);

    expect((await page.request.patch(`/api/ads/campaigns/${draft.id}`, { data: { status: "active" } })).status()).toBe(200);
  });

  test("performance: 7d/30d series + INR totals", async ({ page }) => {
    await login(page);
    const d = (await (await page.request.get("/api/ads/performance?range=7d")).json()) as {
      ok: boolean; demo: boolean; currency: string; totals: { spend: number; cost_per_result: number };
      series: { date: string }[];
    };
    expect(d.ok).toBe(true);
    expect(d.demo).toBe(true);
    expect(d.currency).toBe("INR");
    expect(d.series.length).toBe(7);
    expect(d.totals.spend).toBeGreaterThan(0);
    expect(d.totals.cost_per_result).toBeGreaterThan(0);

    const d30 = (await (await page.request.get("/api/ads/performance?range=30d")).json()) as { series: { date: string }[] };
    expect(d30.series.length).toBe(30);
  });
});

test.afterAll(async () => {
  try {
    await pool.query(`DELETE FROM ads_mock_campaigns WHERE name LIKE 'e2e_ads%'`);
  } catch { /* best-effort cleanup */ }
  await pool.end();
});
