import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";
import { Pool } from "pg";

/**
 * r-nbo-ig-access-prep acceptance: IG webhook GET challenge + signed POST
 * ingest (DM + comment), idempotent on Meta ids, invalid signature rejected;
 * Settings > Connections shows the mock-badged IG row and connect works in
 * mock mode (IG_LIVE != true -> no Graph call).
 *
 * PROD GUARD: same as smoke.spec — never mutate prod.
 */
const PROD_DB_URL = process.env.DATABASE_URL ?? "";
if (PROD_DB_URL.includes("one-db:5432") || PROD_DB_URL.includes("one.nextbizstudio.com")) {
  console.error("[PROD GUARD] DATABASE_URL points to production. E2E suite aborted.");
  process.exit(0);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const VT = process.env.IG_WEBHOOK_VERIFY_TOKEN ?? "nbo-e2e-ig-verify";
const SECRET = process.env.IG_APP_SECRET ?? "nbo-e2e-ig-secret";

function sign(body: string) {
  return "sha256=" + createHmac("sha256", SECRET).update(body).digest("hex");
}

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.fill("#email", process.env.OPERATOR_EMAIL ?? "operator@nextbiz.one");
  await page.fill("#password", process.env.OPERATOR_PASS ?? "operator-test-pass");
  await Promise.all([page.click("button[type=submit]"), page.waitForURL("**/")]);
}

test.describe("IG access prep (r-nbo-ig-access-prep)", () => {
  test("webhook GET: echoes hub.challenge on valid verify token, 403 otherwise", async ({ request }) => {
    const ok = await request.get(`/api/webhooks/instagram?hub.mode=subscribe&hub.verify_token=${VT}&hub.challenge=IG-CH-42`);
    expect(ok.status()).toBe(200);
    expect(await ok.text()).toBe("IG-CH-42");
    const bad = await request.get("/api/webhooks/instagram?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=X");
    expect(bad.status()).toBe(403);
  });

  test("webhook POST: signed DM + comment stored; retry is idempotent; bad sig 401", async ({ request }) => {
    const t = Date.now();
    const dm = JSON.stringify({
      object: "instagram",
      entry: [{
        id: "ig-user-e2e",
        time: t,
        messaging: [{
          sender: { id: `fan-${t}`, username: "e2e_fan" },
          recipient: { id: "ig-user-e2e" },
          timestamp: String(Math.floor(t / 1000)),
          message: { mid: `mid-ig-${t}`, text: "hello via ig dm" },
        }],
      }],
    });
    const comment = JSON.stringify({
      object: "instagram",
      entry: [{
        id: "ig-user-e2e",
        time: t + 1,
        changes: [{
          field: "comments",
          value: { comment_id: `c-ig-${t}`, from: { id: `fan-${t}`, username: "e2e_fan" }, media_id: "m-1", text: "love it" },
        }],
      }],
    });

    // invalid signature: stored flagged, rejected (separate envelope so the
    // valid one below is not deduped against the flagged row)
    const badBody = JSON.stringify({
      object: "instagram",
      entry: [{
        id: "ig-user-e2e",
        time: t,
        messaging: [{
          sender: { id: `fan-${t}`, username: "e2e_fan" },
          recipient: { id: "ig-user-e2e" },
          timestamp: String(Math.floor(t / 1000)),
          message: { mid: `mid-ig-bad-${t}`, text: "bad sig" },
        }],
      }],
    });
    const bad = await request.post("/api/webhooks/instagram", { data: JSON.parse(badBody), headers: { "x-hub-signature-256": "sha256=" + "0".repeat(64) } });
    expect(bad.status()).toBe(401);

    // valid DM
    const ok1 = await request.post("/api/webhooks/instagram", { data: JSON.parse(dm), headers: { "x-hub-signature-256": sign(dm) } });
    expect(ok1.status()).toBe(200);
    expect(((await ok1.json()) as { stored: number }).stored).toBe(1);

    // valid comment
    const ok2 = await request.post("/api/webhooks/instagram", { data: JSON.parse(comment), headers: { "x-hub-signature-256": sign(comment) } });
    expect(ok2.status()).toBe(200);
    expect(((await ok2.json()) as { stored: number }).stored).toBe(1);

    // Meta retry: same envelope again -> 200 but duplicate, no new rows
    const retry = await request.post("/api/webhooks/instagram", { data: JSON.parse(dm), headers: { "x-hub-signature-256": sign(dm) } });
    expect(retry.status()).toBe(200);
    const rj = (await retry.json()) as { stored: number; duplicate: boolean };
    expect(rj.duplicate).toBe(true);
    expect(rj.stored).toBe(0);

    // DB truth
    const m = await pool.query(`SELECT mid, sender_id, body FROM ig_messages WHERE mid = $1`, [`mid-ig-${t}`]);
    expect(m.rowCount).toBe(1);
    expect(m.rows[0].body).toBe("hello via ig dm");
    const c = await pool.query(`SELECT comment_id, text FROM ig_comments WHERE comment_id = $1`, [`c-ig-${t}`]);
    expect(c.rowCount).toBe(1);
    expect(c.rows[0].text).toBe("love it");
    const ev = await pool.query(`SELECT signature_valid, processed FROM ig_webhook_events WHERE ig_event_id = $1`, [`ig-user-e2e:mid-ig-${t}`]);
    expect(ev.rowCount).toBe(1);
    expect(ev.rows[0].signature_valid).toBe(true);
    expect(ev.rows[0].processed).toBe(true);
    // the bad-sig envelope was stored flagged but NOT processed
    const badEv = await pool.query(
      `SELECT processed FROM ig_webhook_events WHERE ig_event_id = $1`, [`ig-user-e2e:mid-ig-bad-${t}`]);
    expect(badEv.rowCount).toBe(1);
    expect(badEv.rows[0].processed).toBe(false);
    const badMsg = await pool.query(`SELECT id FROM ig_messages WHERE mid = $1`, [`mid-ig-bad-${t}`]);
    expect(badMsg.rowCount).toBe(0);
  });

  test("settings connections: IG connect via API stores mock account (IG_LIVE=false)", async ({ page }) => {
    await login(page);
    await page.goto("/settings");
    await page.locator(".si", { hasText: "Connections" }).click();
    await expect(page.getByTestId("ig-acct")).toBeVisible();
    await expect(page.getByTestId("ig-acct").locator(".st")).toBeVisible();
    const conn = await page.request.post("/api/instagram/connect", {
      data: { access_token: "EAAmock-token-123" },
    });
    const connJ = (await conn.json()) as { ok: boolean; mock: boolean };
    expect(connJ.ok).toBe(true);
    expect(connJ.mock).toBe(true);
    await page.reload();
    await page.locator(".si", { hasText: "Connections" }).click();
    await expect(page.getByTestId("ig-acct")).toContainText("@mock_business");
    await expect(page.getByTestId("ig-acct")).toContainText("Connecting…");
    const st = await page.request.get("/api/instagram/connect");
    const j = (await st.json()) as { ok: boolean; live: boolean; account: { live: boolean; username: string } | null };
    expect(j.ok).toBe(true);
    expect(j.live).toBe(false);
    expect(j.account?.live).toBe(false);
    expect(j.account?.username).toBe("@mock_business");
    const audit = await pool.query(`SELECT action FROM ig_audit ORDER BY id DESC LIMIT 1`);
    expect(audit.rows[0].action).toBe("connect-mock");
  });
});
